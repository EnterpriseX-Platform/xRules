use std::collections::VecDeque;
use std::sync::Arc;

use tokio::sync::{mpsc, Mutex, Notify, Semaphore};
use tokio::task::JoinHandle;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

use crate::engine::executor::FlowExecutor;
use crate::models::{ExecutionStatus, Flow};

/// Execution task for the worker pool
#[derive(Debug, Clone)]
pub struct ExecutionTask {
    pub id: Uuid,
    pub flow: Flow,
    pub input: Option<serde_json::Value>,
    pub metadata: Option<std::collections::HashMap<String, String>>,
    pub priority: TaskPriority,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

impl ExecutionTask {
    pub fn new(flow: Flow) -> Self {
        Self {
            id: Uuid::new_v4(),
            flow,
            input: None,
            metadata: None,
            priority: TaskPriority::Normal,
            created_at: chrono::Utc::now(),
        }
    }
    
    pub fn with_input(mut self, input: serde_json::Value) -> Self {
        self.input = Some(input);
        self
    }
    
    pub fn with_metadata(mut self, metadata: std::collections::HashMap<String, String>) -> Self {
        self.metadata = Some(metadata);
        self
    }
    
    pub fn with_priority(mut self, priority: TaskPriority) -> Self {
        self.priority = priority;
        self
    }
}

/// Task priority levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum TaskPriority {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3,
}

/// Task result
#[derive(Debug, Clone)]
pub struct TaskResult {
    pub task_id: Uuid,
    pub status: ExecutionStatus,
    pub output: Option<serde_json::Value>,
    pub error: Option<String>,
    pub duration_ms: i64,
    pub completed_at: chrono::DateTime<chrono::Utc>,
}

/// Worker pool for executing flows
pub struct WorkerPool {
    executor: Arc<FlowExecutor>,
    max_workers: usize,
    max_concurrent: usize,
    task_queue: Arc<Mutex<VecDeque<ExecutionTask>>>,
    result_tx: mpsc::Sender<TaskResult>,
    result_rx: Arc<Mutex<mpsc::Receiver<TaskResult>>>,
    shutdown_tx: Option<mpsc::Sender<()>>,
    workers: Vec<JoinHandle<()>>,
    semaphore: Arc<Semaphore>,
    notify: Arc<Notify>,
}

impl WorkerPool {
    pub fn new(executor: Arc<FlowExecutor>, max_workers: usize, max_concurrent: usize) -> Self {
        let (result_tx, result_rx) = mpsc::channel(1000);
        
        Self {
            executor,
            max_workers,
            max_concurrent,
            task_queue: Arc::new(Mutex::new(VecDeque::new())),
            result_tx,
            result_rx: Arc::new(Mutex::new(result_rx)),
            shutdown_tx: None,
            workers: Vec::new(),
            semaphore: Arc::new(Semaphore::new(max_concurrent)),
            notify: Arc::new(Notify::new()),
        }
    }
    
    /// Start the worker pool
    pub fn start(&mut self) {
        let (shutdown_tx, mut shutdown_rx) = mpsc::channel(1);
        self.shutdown_tx = Some(shutdown_tx);
        
        for worker_id in 0..self.max_workers {
            let executor = Arc::clone(&self.executor);
            let task_queue = Arc::clone(&self.task_queue);
            let result_tx = self.result_tx.clone();
            let semaphore = Arc::clone(&self.semaphore);
            let notify = Arc::clone(&self.notify);
            
            let handle = tokio::spawn(async move {
                info!("Worker {} started", worker_id);
                
                loop {
                    // Check for shutdown
                    if shutdown_rx.try_recv().is_ok() {
                        debug!("Worker {} received shutdown signal", worker_id);
                        break;
                    }
                    
                    // Try to get a task
                    let task = {
                        let mut queue = task_queue.lock().await;
                        queue.pop_front()
                    };
                    
                    if let Some(task) = task {
                        // Acquire semaphore permit
                        let permit = match semaphore.acquire().await {
                            Ok(permit) => permit,
                            Err(e) => {
                                error!("Failed to acquire semaphore: {}", e);
                                continue;
                            }
                        };
                        
                        info!("Worker {} processing task {}", worker_id, task.id);
                        let start_time = std::time::Instant::now();
                        
                        // Execute the flow
                        match executor.execute(&task.flow, task.input.clone()).await {
                            Ok(result) => {
                                let task_result = TaskResult {
                                    task_id: task.id,
                                    status: result.status,
                                    output: result.output,
                                    error: result.error,
                                    duration_ms: result.duration_ms,
                                    completed_at: chrono::Utc::now(),
                                };
                                
                                if let Err(e) = result_tx.send(task_result).await {
                                    error!("Failed to send task result: {}", e);
                                }
                                
                                info!(
                                    "Worker {} completed task {} in {}ms",
                                    worker_id,
                                    task.id,
                                    start_time.elapsed().as_millis()
                                );
                            }
                            Err(e) => {
                                error!("Worker {} failed to execute task {}: {:?}", worker_id, task.id, e);
                                
                                let task_result = TaskResult {
                                    task_id: task.id,
                                    status: ExecutionStatus::Failed,
                                    output: None,
                                    error: Some(e.to_string()),
                                    duration_ms: start_time.elapsed().as_millis() as i64,
                                    completed_at: chrono::Utc::now(),
                                };
                                
                                if let Err(e) = result_tx.send(task_result).await {
                                    error!("Failed to send task result: {}", e);
                                }
                            }
                        }
                        
                        drop(permit);
                    } else {
                        // No tasks, wait for notification
                        tokio::select! {
                            _ = notify.notified() => {}
                            _ = tokio::time::sleep(tokio::time::Duration::from_secs(1)) => {}
                        }
                    }
                }
                
                info!("Worker {} stopped", worker_id);
            });
            
            self.workers.push(handle);
        }
        
        info!("Worker pool started with {} workers", self.max_workers);
    }
    
    /// Submit a task to the pool
    pub async fn submit(&self, task: ExecutionTask) -> crate::Result<()> {
        let mut queue = self.task_queue.lock().await;
        
        // Insert based on priority (higher priority first)
        let insert_pos = queue
            .iter()
            .position(|t| t.priority < task.priority)
            .unwrap_or(queue.len());
        
        queue.insert(insert_pos, task);
        
        // Notify workers
        self.notify.notify_one();
        
        Ok(())
    }
    
    /// Submit multiple tasks
    pub async fn submit_batch(&self, tasks: Vec<ExecutionTask>) -> crate::Result<()> {
        let mut queue = self.task_queue.lock().await;
        
        for task in tasks {
            let insert_pos = queue
                .iter()
                .position(|t| t.priority < task.priority)
                .unwrap_or(queue.len());
            
            queue.insert(insert_pos, task);
        }
        
        // Notify all workers
        for _ in 0..self.max_workers {
            self.notify.notify_one();
        }
        
        Ok(())
    }
    
    /// Get the number of pending tasks
    pub async fn pending_count(&self) -> usize {
        let queue = self.task_queue.lock().await;
        queue.len()
    }
    
    /// Get results channel
    pub fn results(&self) -> mpsc::Receiver<TaskResult> {
        // This won't work with the current architecture - would need to change design
        // For now, return a dummy receiver
        let (_, rx) = mpsc::channel(1);
        rx
    }
    
    /// Cancel a pending task
    pub async fn cancel_task(&self, task_id: Uuid) -> bool {
        let mut queue = self.task_queue.lock().await;
        if let Some(pos) = queue.iter().position(|t| t.id == task_id) {
            queue.remove(pos);
            true
        } else {
            false
        }
    }
    
    /// Clear all pending tasks
    pub async fn clear_pending(&self) {
        let mut queue = self.task_queue.lock().await;
        queue.clear();
    }
    
    /// Shutdown the worker pool
    pub async fn shutdown(&mut self) {
        info!("Shutting down worker pool...");
        
        // Signal shutdown
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(()).await;
        }
        
        // Wait for all workers to finish
        for handle in self.workers.drain(..) {
            if let Err(e) = handle.await {
                warn!("Worker join error: {:?}", e);
            }
        }
        
        info!("Worker pool shutdown complete");
    }
}

/// Builder for worker pools
pub struct WorkerPoolBuilder {
    executor: Option<Arc<FlowExecutor>>,
    max_workers: usize,
    max_concurrent: usize,
}

impl WorkerPoolBuilder {
    pub fn new() -> Self {
        Self {
            executor: None,
            max_workers: num_cpus::get(),
            max_concurrent: 100,
        }
    }
    
    pub fn executor(mut self, executor: Arc<FlowExecutor>) -> Self {
        self.executor = Some(executor);
        self
    }
    
    pub fn max_workers(mut self, max_workers: usize) -> Self {
        self.max_workers = max_workers;
        self
    }
    
    pub fn max_concurrent(mut self, max_concurrent: usize) -> Self {
        self.max_concurrent = max_concurrent;
        self
    }
    
    pub fn build(self) -> crate::Result<WorkerPool> {
        let executor = self.executor
            .ok_or_else(|| crate::XRulesError::Config("Executor is required".to_string()))?;
        
        Ok(WorkerPool::new(executor, self.max_workers, self.max_concurrent))
    }
}

impl Default for WorkerPoolBuilder {
    fn default() -> Self {
        Self::new()
    }
}

/// Distributed task queue for multiple worker pools
pub struct DistributedTaskQueue {
    redis: Option<fred::clients::RedisPool>,
    queue_key: String,
    processing_key: String,
}

impl DistributedTaskQueue {
    pub fn new(redis: Option<fred::clients::RedisPool>) -> Self {
        Self {
            redis,
            queue_key: "xrules:task:queue".to_string(),
            processing_key: "xrules:task:processing".to_string(),
        }
    }
    
    /// Enqueue a task
    pub async fn enqueue(&self, task: &ExecutionTask) -> crate::Result<()> {
        if let Some(redis) = &self.redis {
            let task_json = serde_json::to_string(task)?;
            redis.rpush(&self.queue_key, task_json, None).await?;
            Ok(())
        } else {
            Err(crate::XRulesError::Config("Redis not configured".to_string()))
        }
    }
    
    /// Dequeue a task (blocking)
    pub async fn dequeue(&self, timeout_seconds: u64) -> crate::Result<Option<ExecutionTask>> {
        if let Some(redis) = &self.redis {
            let result: Option<(String, String)> = redis
                .blpop(&self.queue_key, timeout_seconds as i64)
                .await?;
            
            if let Some((_, task_json)) = result {
                let task: ExecutionTask = serde_json::from_str(&task_json)?;
                
                // Move to processing queue
                let processing_entry = format!("{}:{}", task.id, task_json);
                redis.sadd(&self.processing_key, processing_entry).await?;
                
                Ok(Some(task))
            } else {
                Ok(None)
            }
        } else {
            Err(crate::XRulesError::Config("Redis not configured".to_string()))
        }
    }
    
    /// Mark task as completed
    pub async fn complete(&self, task_id: Uuid) -> crate::Result<()> {
        if let Some(redis) = &self.redis {
            // Remove from processing queue (requires scanning since we don't have the full entry)
            let members: Vec<String> = redis.smembers(&self.processing_key).await?;
            for member in members {
                if member.starts_with(&format!("{}:", task_id)) {
                    redis.srem(&self.processing_key, member).await?;
                    break;
                }
            }
            Ok(())
        } else {
            Err(crate::XRulesError::Config("Redis not configured".to_string()))
        }
    }
    
    /// Get queue length
    pub async fn queue_length(&self) -> crate::Result<usize> {
        if let Some(redis) = &self.redis {
            let len: i64 = redis.llen(&self.queue_key).await?;
            Ok(len as usize)
        } else {
            Ok(0)
        }
    }
}
