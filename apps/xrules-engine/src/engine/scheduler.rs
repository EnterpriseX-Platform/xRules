use std::collections::HashMap;
use std::sync::Arc;

use chrono::{DateTime, Utc};
use cron::Schedule;
use tokio::sync::RwLock;
use tokio::task::JoinHandle;
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::engine::executor::FlowExecutor;
use crate::models::{ExecutionStatus, Flow};

/// Scheduled flow definition
#[derive(Debug, Clone)]
pub struct ScheduledFlow {
    pub id: Uuid,
    pub flow_id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub cron_expression: String,
    pub timezone: chrono_tz::Tz,
    pub enabled: bool,
    pub next_run: Option<DateTime<Utc>>,
    pub last_run: Option<DateTime<Utc>>,
    pub last_status: Option<ExecutionStatus>,
}

impl ScheduledFlow {
    pub fn new(
        flow_id: Uuid,
        project_id: Uuid,
        name: impl Into<String>,
        cron_expression: impl Into<String>,
    ) -> crate::Result<Self> {
        let cron_expr = cron_expression.into();
        
        // Validate cron expression
        match cron_expr.parse::<Schedule>() {
            Ok(_) => {}
            Err(e) => return Err(crate::XRulesError::Validation(format!("Invalid cron expression: {}", e))),
        }
        
        Ok(Self {
            id: Uuid::new_v4(),
            flow_id,
            project_id,
            name: name.into(),
            cron_expression: cron_expr,
            timezone: chrono_tz::UTC,
            enabled: true,
            next_run: None,
            last_run: None,
            last_status: None,
        })
    }
    
    pub fn with_timezone(mut self, timezone: chrono_tz::Tz) -> Self {
        self.timezone = timezone;
        self
    }
    
    /// Calculate next run time based on cron expression
    pub fn calculate_next_run(&self, from: DateTime<Utc>) -> Option<DateTime<Utc>> {
        let schedule = self.cron_expression.parse::<Schedule>().ok()?;
        schedule.after(&from).next()
    }
    
    /// Update next run time
    pub fn update_next_run(&mut self) {
        let now = Utc::now();
        self.next_run = self.calculate_next_run(now);
    }
}

/// Cron-based scheduler for flows
pub struct CronScheduler {
    schedules: Arc<RwLock<HashMap<Uuid, ScheduledFlow>>>,
    handles: Arc<RwLock<HashMap<Uuid, JoinHandle<()>>>>,
    executor: Arc<FlowExecutor>,
    flows: Arc<RwLock<HashMap<Uuid, Flow>>>,
}

impl CronScheduler {
    pub fn new(executor: Arc<FlowExecutor>) -> Self {
        Self {
            schedules: Arc::new(RwLock::new(HashMap::new())),
            handles: Arc::new(RwLock::new(HashMap::new())),
            executor,
            flows: Arc::new(RwLock::new(HashMap::new())),
        }
    }
    
    /// Add a schedule
    pub async fn add_schedule(&self, mut schedule: ScheduledFlow, flow: Flow) -> crate::Result<()> {
        // Calculate initial next run
        schedule.update_next_run();
        
        let id = schedule.id;
        let flow_id = schedule.flow_id;
        
        {
            let mut schedules = self.schedules.write().await;
            schedules.insert(id, schedule);
        }
        
        {
            let mut flows = self.flows.write().await;
            flows.insert(flow_id, flow);
        }
        
        info!("Added scheduled flow: {} (flow_id: {})", id, flow_id);
        Ok(())
    }
    
    /// Remove a schedule
    pub async fn remove_schedule(&self, schedule_id: Uuid) -> crate::Result<bool> {
        // Cancel running task if any
        {
            let mut handles = self.handles.write().await;
            if let Some(handle) = handles.remove(&schedule_id) {
                handle.abort();
            }
        }
        
        // Remove from schedules
        let mut schedules = self.schedules.write().await;
        Ok(schedules.remove(&schedule_id).is_some())
    }
    
    /// Enable a schedule
    pub async fn enable_schedule(&self, schedule_id: Uuid) -> crate::Result<bool> {
        let mut schedules = self.schedules.write().await;
        if let Some(schedule) = schedules.get_mut(&schedule_id) {
            schedule.enabled = true;
            schedule.update_next_run();
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Disable a schedule
    pub async fn disable_schedule(&self, schedule_id: Uuid) -> crate::Result<bool> {
        let mut schedules = self.schedules.write().await;
        if let Some(schedule) = schedules.get_mut(&schedule_id) {
            schedule.enabled = false;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    
    /// Start the scheduler
    pub async fn start(&self) -> JoinHandle<()> {
        let schedules = Arc::clone(&self.schedules);
        let handles = Arc::clone(&self.handles);
        let executor = Arc::clone(&self.executor);
        let flows = Arc::clone(&self.flows);
        
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(60));
            
            loop {
                interval.tick().await;
                
                let now = Utc::now();
                let schedules_to_run: Vec<(Uuid, Uuid)> = {
                    let schedules = schedules.read().await;
                    schedules
                        .values()
                        .filter(|s| {
                            s.enabled && s.next_run.map(|t| t <= now).unwrap_or(false)
                        })
                        .map(|s| (s.id, s.flow_id))
                        .collect()
                };
                
                for (schedule_id, flow_id) in schedules_to_run {
                    let flows = Arc::clone(&flows);
                    let executor = Arc::clone(&executor);
                    let schedules = Arc::clone(&schedules);
                    let handles = Arc::clone(&handles);
                    
                    let handle = tokio::spawn(async move {
                        // Get the flow
                        let flow = {
                            let flows = flows.read().await;
                            flows.get(&flow_id).cloned()
                        };
                        
                        if let Some(flow) = flow {
                            info!("Running scheduled flow: {}", flow_id);
                            
                            match executor.execute(&flow, None).await {
                                Ok(result) => {
                                    info!(
                                        "Scheduled flow completed: {} with status {:?}",
                                        flow_id, result.status
                                    );
                                    
                                    // Update schedule
                                    let mut schedules = schedules.write().await;
                                    if let Some(schedule) = schedules.get_mut(&schedule_id) {
                                        schedule.last_run = Some(Utc::now());
                                        schedule.last_status = Some(result.status);
                                        schedule.update_next_run();
                                    }
                                }
                                Err(e) => {
                                    error!("Scheduled flow failed: {} - {:?}", flow_id, e);
                                    
                                    // Update schedule with failure
                                    let mut schedules = schedules.write().await;
                                    if let Some(schedule) = schedules.get_mut(&schedule_id) {
                                        schedule.last_run = Some(Utc::now());
                                        schedule.last_status = Some(ExecutionStatus::Failed);
                                        schedule.update_next_run();
                                    }
                                }
                            }
                        } else {
                            warn!("Flow not found for scheduled execution: {}", flow_id);
                        }
                        
                        // Remove handle
                        let mut handles = handles.write().await;
                        handles.remove(&schedule_id);
                    });
                    
                    // Store handle
                    let mut handles = handles.write().await;
                    handles.insert(schedule_id, handle);
                }
            }
        })
    }
    
    /// Get all schedules
    pub async fn get_schedules(&self) -> Vec<ScheduledFlow> {
        let schedules = self.schedules.read().await;
        schedules.values().cloned().collect()
    }
    
    /// Get schedule by ID
    pub async fn get_schedule(&self, schedule_id: Uuid) -> Option<ScheduledFlow> {
        let schedules = self.schedules.read().await;
        schedules.get(&schedule_id).cloned()
    }
    
    /// Get schedules for a flow
    pub async fn get_schedules_for_flow(&self, flow_id: Uuid) -> Vec<ScheduledFlow> {
        let schedules = self.schedules.read().await;
        schedules
            .values()
            .filter(|s| s.flow_id == flow_id)
            .cloned()
            .collect()
    }
    
    /// Stop the scheduler
    pub async fn stop(&self) {
        let mut handles = self.handles.write().await;
        for (_, handle) in handles.drain() {
            handle.abort();
        }
    }
}

/// Schedule builder
pub struct ScheduleBuilder {
    flow_id: Uuid,
    project_id: Uuid,
    name: String,
    cron_expression: String,
    timezone: Option<chrono_tz::Tz>,
}

impl ScheduleBuilder {
    pub fn new(flow_id: Uuid, project_id: Uuid) -> Self {
        Self {
            flow_id,
            project_id,
            name: String::new(),
            cron_expression: String::new(),
            timezone: None,
        }
    }
    
    pub fn name(mut self, name: impl Into<String>) -> Self {
        self.name = name.into();
        self
    }
    
    pub fn cron(mut self, expression: impl Into<String>) -> Self {
        self.cron_expression = expression.into();
        self
    }
    
    pub fn timezone(mut self, timezone: chrono_tz::Tz) -> Self {
        self.timezone = Some(timezone);
        self
    }
    
    pub fn build(self) -> crate::Result<ScheduledFlow> {
        let mut schedule = ScheduledFlow::new(
            self.flow_id,
            self.project_id,
            self.name,
            self.cron_expression,
        )?;
        
        if let Some(tz) = self.timezone {
            schedule = schedule.with_timezone(tz);
        }
        
        Ok(schedule)
    }
}

/// Helper functions for common cron expressions
pub mod cron_helpers {
    /// Every minute
    pub fn every_minute() -> &'static str {
        "* * * * *"
    }
    
    /// Every hour at minute 0
    pub fn every_hour() -> &'static str {
        "0 * * * *"
    }
    
    /// Every day at midnight
    pub fn daily() -> &'static str {
        "0 0 * * *"
    }
    
    /// Every Monday at 9 AM
    pub fn weekly() -> &'static str {
        "0 9 * * 1"
    }
    
    /// First day of every month at midnight
    pub fn monthly() -> &'static str {
        "0 0 1 * *"
    }
    
    /// Every 5 minutes
    pub fn every_5_minutes() -> &'static str {
        "*/5 * * * *"
    }
    
    /// Every 15 minutes
    pub fn every_15_minutes() -> &'static str {
        "*/15 * * * *"
    }
    
    /// Every 30 minutes
    pub fn every_30_minutes() -> &'static str {
        "*/30 * * * *"
    }
    
    /// At specific time (HH:MM format)
    pub fn at_time(hour: u32, minute: u32) -> String {
        format!("{} {} * * *", minute, hour)
    }
    
    /// Every weekday at specific time
    pub fn weekday_at(hour: u32, minute: u32) -> String {
        format!("{} {} * * 1-5", minute, hour)
    }
    
    /// Every weekend at specific time
    pub fn weekend_at(hour: u32, minute: u32) -> String {
        format!("{} {} * * 0,6", minute, hour)
    }
}
