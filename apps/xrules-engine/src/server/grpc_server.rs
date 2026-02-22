use std::pin::Pin;
use std::sync::Arc;

use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::{Request, Response, Status};
use tracing::{error, info, warn};
use uuid::Uuid;

use crate::engine::{ExecutionEngine, ExecutionOptions, ExecutionResult};
use crate::models::{Flow, ExecutionStatus};
use crate::proto::engine::execution_engine_server::{ExecutionEngine as ExecutionEngineTrait, ExecutionEngineServer};
use crate::proto::engine::*;
use crate::AppState;

pub mod proto {
    pub mod engine {
        tonic::include_proto!("xrules.engine");
        
        pub const FILE_DESCRIPTOR_SET: &[u8] = tonic::include_file_descriptor_set!("engine");
    }
}

/// gRPC server implementation
pub struct GrpcServer {
    engine: Arc<ExecutionEngine>,
}

impl GrpcServer {
    pub async fn new(state: Arc<AppState>) -> crate::Result<Self> {
        // Create the engine with all components
        let registry = crate::nodes::NodeRegistry::with_defaults();
        
        let execution_store: Arc<dyn crate::stores::ExecutionStore> = Arc::new(
            crate::stores::PostgresExecutionStore::new(state.db_pool.clone())
        );
        
        let log_store: Arc<dyn crate::stores::LogStore> = Arc::new(
            crate::stores::PostgresLogStore::new(state.db_pool.clone())
        );
        
        let options = ExecutionOptions {
            timeout_seconds: state.config.execution.timeout_seconds,
            max_retries: state.config.execution.max_retry_attempts,
            enable_caching: state.config.features.enable_caching,
            enable_streaming: state.config.features.enable_streaming,
            parallel_branches: true,
        };
        
        let engine = Arc::new(ExecutionEngine::new(
            registry,
            execution_store,
            log_store,
            options,
        ));
        
        Ok(Self { engine })
    }
    
    pub async fn start(self, addr: std::net::SocketAddr) -> crate::Result<()> {
        info!("Starting gRPC server on {}", addr);
        
        tonic::transport::Server::builder()
            .add_service(self.into_service())
            .serve(addr)
            .await
            .map_err(|e| crate::XRulesError::Execution(e.to_string()))?;
        
        Ok(())
    }
    
    pub fn into_service(self) -> ExecutionEngineServer<Self> {
        ExecutionEngineServer::new(self)
    }
    
    fn parse_flow(&self, bytes: &[u8]) -> Result<Flow, Status> {
        serde_json::from_slice(bytes)
            .map_err(|e| Status::invalid_argument(format!("Invalid flow definition: {}", e)))
    }
    
    fn execution_result_to_proto(&self, execution_id: String, result: ExecutionResult) -> ExecuteFlowResponse {
        ExecuteFlowResponse {
            execution_id,
            status: match result.status {
                ExecutionStatus::Pending => 0,
                ExecutionStatus::Running => 1,
                ExecutionStatus::Completed => 2,
                ExecutionStatus::Failed => 3,
                ExecutionStatus::Cancelled => 4,
                ExecutionStatus::Timeout => 5,
            },
            output_data: result.output.map(|v| v.to_string().into_bytes()).unwrap_or_default(),
            error_message: result.error.unwrap_or_default(),
            start_time: 0,
            end_time: 0,
            duration_ms: result.duration_ms,
        }
    }
}

#[tonic::async_trait]
impl ExecutionEngineTrait for GrpcServer {
    async fn execute_flow(
        &self,
        request: Request<ExecuteFlowRequest>,
    ) -> Result<Response<ExecuteFlowResponse>, Status> {
        let req = request.into_inner();
        
        info!("ExecuteFlow request for flow_id: {}", req.flow_id);
        
        // Parse flow definition
        let flow = self.parse_flow(&req.flow_definition)?;
        
        // Parse input data
        let input = if req.input_data.is_empty() {
            None
        } else {
            Some(serde_json::from_slice(&req.input_data)
                .map_err(|e| Status::invalid_argument(format!("Invalid input data: {}", e)))?)
        };
        
        // Execute flow
        match self.engine.execute(&flow, input, Some(req.metadata)).await {
            Ok(result) => {
                let response = self.execution_result_to_proto(req.execution_id, result);
                Ok(Response::new(response))
            }
            Err(e) => {
                error!("Flow execution error: {:?}", e);
                Err(Status::internal(format!("Execution failed: {}", e)))
            }
        }
    }
    
    type ExecuteFlowStreamingStream = ReceiverStream<ExecutionLogMessage>;
    
    async fn execute_flow_streaming(
        &self,
        request: Request<ExecuteFlowRequest>,
    ) -> Result<Response<Self::ExecuteFlowStreamingStream>, Status> {
        let req = request.into_inner();
        let (tx, rx) = mpsc::channel(100);
        
        info!("ExecuteFlowStreaming request for flow_id: {}", req.flow_id);
        
        // Parse flow definition
        let flow = self.parse_flow(&req.flow_definition)?;
        
        // Parse input data
        let input = if req.input_data.is_empty() {
            None
        } else {
            Some(serde_json::from_slice(&req.input_data)
                .map_err(|e| Status::invalid_argument(format!("Invalid input data: {}", e)))?)
        };
        
        // Clone engine for async task
        let engine = Arc::clone(&self.engine);
        
        // Spawn execution in background
        tokio::spawn(async move {
            match engine.execute(&flow, input, Some(req.metadata)).await {
                Ok(result) => {
                    // Send completion log
                    let log = ExecutionLogMessage {
                        execution_id: req.execution_id.clone(),
                        node_id: "__completion__".to_string(),
                        level: if result.status == ExecutionStatus::Completed { "INFO" } else { "ERROR" }.to_string(),
                        message: format!("Execution completed with status: {:?}", result.status),
                        timestamp: chrono::Utc::now().timestamp(),
                        metadata: std::collections::HashMap::new(),
                    };
                    let _ = tx.send(log).await;
                }
                Err(e) => {
                    let log = ExecutionLogMessage {
                        execution_id: req.execution_id.clone(),
                        node_id: "__error__".to_string(),
                        level: "ERROR".to_string(),
                        message: format!("Execution failed: {}", e),
                        timestamp: chrono::Utc::now().timestamp(),
                        metadata: std::collections::HashMap::new(),
                    };
                    let _ = tx.send(log).await;
                }
            }
        });
        
        Ok(Response::new(ReceiverStream::new(rx)))
    }
    
    async fn validate_flow(
        &self,
        request: Request<ValidateFlowRequest>,
    ) -> Result<Response<ValidateFlowResponse>, Status> {
        let req = request.into_inner();
        
        info!("ValidateFlow request for flow_id: {}", req.flow_id);
        
        // Parse flow definition
        let flow = self.parse_flow(&req.flow_definition)?;
        
        // Validate
        let errors = self.engine.validate_flow(&flow);
        
        let response = ValidateFlowResponse {
            valid: errors.is_empty(),
            errors: errors.into_iter().map(|msg| ValidationError {
                node_id: "__flow__".to_string(),
                field: "".to_string(),
                message: msg,
            }).collect(),
        };
        
        Ok(Response::new(response))
    }
    
    async fn get_execution_status(
        &self,
        request: Request<GetExecutionStatusRequest>,
    ) -> Result<Response<ExecutionStatusResponse>, Status> {
        let req = request.into_inner();
        
        let execution_id = Uuid::parse_str(&req.execution_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid execution ID: {}", e)))?;
        
        // In production, fetch from store
        // For now, return not found
        Err(Status::not_found("Execution not found"))
    }
    
    async fn cancel_execution(
        &self,
        request: Request<CancelExecutionRequest>,
    ) -> Result<Response<CancelExecutionResponse>, Status> {
        let req = request.into_inner();
        
        let execution_id = Uuid::parse_str(&req.execution_id)
            .map_err(|e| Status::invalid_argument(format!("Invalid execution ID: {}", e)))?;
        
        match self.engine.cancel_execution(execution_id).await {
            Ok(true) => {
                Ok(Response::new(CancelExecutionResponse {
                    success: true,
                    status: 4, // CANCELLED
                }))
            }
            Ok(false) => {
                Ok(Response::new(CancelExecutionResponse {
                    success: false,
                    status: 0, // PENDING
                }))
            }
            Err(e) => Err(Status::internal(format!("Cancel failed: {}", e))),
        }
    }
    
    async fn list_executions(
        &self,
        _request: Request<ListExecutionsRequest>,
    ) -> Result<Response<ListExecutionsResponse>, Status> {
        // In production, fetch from store
        Ok(Response::new(ListExecutionsResponse {
            executions: vec![],
            total: 0,
        }))
    }
    
    async fn get_execution_logs(
        &self,
        _request: Request<GetExecutionLogsRequest>,
    ) -> Result<Response<GetExecutionLogsResponse>, Status> {
        // In production, fetch from store
        Ok(Response::new(GetExecutionLogsResponse {
            logs: vec![],
            total: 0,
        }))
    }
    
    type StreamExecutionUpdatesStream = ReceiverStream<ExecutionUpdate>;
    
    async fn stream_execution_updates(
        &self,
        request: Request<StreamExecutionUpdatesRequest>,
    ) -> Result<Response<Self::StreamExecutionUpdatesStream>, Status> {
        let req = request.into_inner();
        let (tx, rx) = mpsc::channel(100);
        
        let _execution_id = req.execution_id;
        
        // In production, subscribe to execution updates
        // For now, just send a single update
        tokio::spawn(async move {
            let update = ExecutionUpdate {
                execution_id: _execution_id.clone(),
                status: 1, // RUNNING
                current_node_id: "__start__".to_string(),
                progress_percent: 0,
                timestamp: chrono::Utc::now().timestamp(),
                message: "Execution started".to_string(),
            };
            let _ = tx.send(update).await;
        });
        
        Ok(Response::new(ReceiverStream::new(rx)))
    }
}
