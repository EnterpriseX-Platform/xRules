use crate::grpc::proto::{
    engine_service_server::EngineService,
    ExecuteRequest, ExecuteResponse,
    HealthCheckRequest, HealthCheckResponse,
    ListEnginesRequest, ListEnginesResponse,
    ValidateRequest, ValidateResponse,
    InferenceRequest, InferenceResponse,
    EngineInfo as GrpcEngineInfo,
};
use crate::hub::{EngineHub, ExecuteRequest as HubExecuteRequest, RulePayload as HubRulePayload};
use std::pin::Pin;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use tokio_stream::{Stream, StreamExt};
use tracing::{info, error};
use uuid::Uuid;

/// gRPC Engine Service implementation
pub struct GrpcEngineService {
    hub: Arc<EngineHub>,
}

impl GrpcEngineService {
    pub fn new(hub: Arc<EngineHub>) -> Self {
        Self { hub }
    }
}

#[tonic::async_trait]
impl EngineService for GrpcEngineService {
    async fn execute(
        &self,
        request: Request<ExecuteRequest>,
    ) -> Result<Response<ExecuteResponse>, Status> {
        let req = request.into_inner();
        let start = std::time::Instant::now();
        let request_id = Uuid::new_v4().to_string();
        
        info!("gRPC Execute request: engine={}, request_id={}", req.engine_type, request_id);
        
        // Parse input JSON
        let input: serde_json::Value = match serde_json::from_slice(&req.input) {
            Ok(v) => v,
            Err(e) => {
                return Ok(Response::new(ExecuteResponse {
                    success: false,
                    output: vec![],
                    error: format!("Invalid input JSON: {}", e),
                    duration_ms: start.elapsed().as_millis() as i64,
                    engine_used: "".to_string(),
                    request_id,
                }));
            }
        };
        
        // Construct inline rule from gRPC fields
        let definition: serde_json::Value = if req.definition.is_empty() {
            serde_json::Value::Object(serde_json::Map::new())
        } else {
            serde_json::from_slice(&req.definition).unwrap_or_default()
        };
        let hub_req = HubExecuteRequest {
            rule: HubRulePayload {
                rule_type: req.rule_type.clone(),
                engine: if req.engine_type.is_empty() { "rules".to_string() } else { req.engine_type.clone() },
                definition,
            },
            input,
            context: if req.context.is_empty() {
                None
            } else {
                Some(serde_json::json!(req.context))
            },
        };
        
        match self.hub.execute(hub_req).await {
            Ok(output) => {
                let output_bytes = match serde_json::to_vec(&output) {
                    Ok(b) => b,
                    Err(e) => {
                        return Ok(Response::new(ExecuteResponse {
                            success: false,
                            output: vec![],
                            error: format!("Failed to serialize output: {}", e),
                            duration_ms: start.elapsed().as_millis() as i64,
                            engine_used: "".to_string(),
                            request_id,
                        }));
                    }
                };
                
                Ok(Response::new(ExecuteResponse {
                    success: true,
                    output: output_bytes,
                    error: "".to_string(),
                    duration_ms: start.elapsed().as_millis() as i64,
                    engine_used: "rules".to_string(),
                    request_id,
                }))
            }
            Err(e) => {
                error!("gRPC execution error: {}", e);
                Ok(Response::new(ExecuteResponse {
                    success: false,
                    output: vec![],
                    error: e.to_string(),
                    duration_ms: start.elapsed().as_millis() as i64,
                    engine_used: "".to_string(),
                    request_id,
                }))
            }
        }
    }
    
    type StreamExecuteStream = Pin<Box<dyn Stream<Item = Result<ExecuteResponse, Status>> + Send>>;
    
    async fn stream_execute(
        &self,
        request: Request<tonic::Streaming<ExecuteRequest>>,
    ) -> Result<Response<Self::StreamExecuteStream>, Status> {
        let mut stream = request.into_inner();
        let hub = self.hub.clone();
        
        let output_stream = async_stream::try_stream! {
            while let Some(req) = stream.message().await? {
                let start = std::time::Instant::now();
                let request_id = Uuid::new_v4().to_string();
                
                let input: serde_json::Value = match serde_json::from_slice(&req.input) {
                    Ok(v) => v,
                    Err(e) => {
                        yield ExecuteResponse {
                            success: false,
                            output: vec![],
                            error: format!("Invalid input JSON: {}", e),
                            duration_ms: start.elapsed().as_millis() as i64,
                            engine_used: "".to_string(),
                            request_id,
                        };
                        continue;
                    }
                };
                
                // Construct inline rule from gRPC fields
                let def: serde_json::Value = if req.definition.is_empty() {
                    serde_json::Value::Object(serde_json::Map::new())
                } else {
                    serde_json::from_slice(&req.definition).unwrap_or_default()
                };
                let hub_req = HubExecuteRequest {
                    rule: HubRulePayload {
                        rule_type: req.rule_type.clone(),
                        engine: if req.engine_type.is_empty() { "rules".to_string() } else { req.engine_type.clone() },
                        definition: def,
                    },
                    input,
                    context: None,
                };
                
                match hub.execute(hub_req).await {
                    Ok(output) => {
                        let output_bytes = serde_json::to_vec(&output).unwrap_or_default();
                        yield ExecuteResponse {
                            success: true,
                            output: output_bytes,
                            error: "".to_string(),
                            duration_ms: start.elapsed().as_millis() as i64,
                            engine_used: "rules".to_string(),
                            request_id,
                        };
                    }
                    Err(e) => {
                        yield ExecuteResponse {
                            success: false,
                            output: vec![],
                            error: e.to_string(),
                            duration_ms: start.elapsed().as_millis() as i64,
                            engine_used: "".to_string(),
                            request_id,
                        };
                    }
                }
            }
        };
        
        Ok(Response::new(Box::pin(output_stream)))
    }
    
    async fn health_check(
        &self,
        _request: Request<HealthCheckRequest>,
    ) -> Result<Response<HealthCheckResponse>, Status> {
        let engines = self.hub.list_engines().await;
        
        Ok(Response::new(HealthCheckResponse {
            status: "healthy".to_string(),
            service: "xrules-engine-hub".to_string(),
            version: "0.1.0".to_string(),
            engines: engines.into_iter().map(|e| e.name).collect(),
            uptime_seconds: 0,  // TODO: track actual uptime
        }))
    }
    
    async fn list_engines(
        &self,
        _request: Request<ListEnginesRequest>,
    ) -> Result<Response<ListEnginesResponse>, Status> {
        let engines = self.hub.list_engines().await;
        
        let grpc_engines: Vec<GrpcEngineInfo> = engines
            .into_iter()
            .map(|e| GrpcEngineInfo {
                name: e.name,
                engine_type: e.engine_type,
                status: e.status,
                standards: e.standards,
                version: e.version,
            })
            .collect();
        
        Ok(Response::new(ListEnginesResponse {
            engines: grpc_engines,
        }))
    }
    
    async fn validate(
        &self,
        request: Request<ValidateRequest>,
    ) -> Result<Response<ValidateResponse>, Status> {
        let req = request.into_inner();
        
        let definition: serde_json::Value = if req.definition.is_empty() {
            serde_json::Value::Object(serde_json::Map::new())
        } else {
            serde_json::from_slice(&req.definition).unwrap_or_default()
        };
        let payload = HubRulePayload {
            rule_type: req.rule_type.clone(),
            engine: if req.engine_type.is_empty() { "rules".to_string() } else { req.engine_type.clone() },
            definition,
        };
        match self.hub.validate_rule(&payload).await {
            Ok(_) => Ok(Response::new(ValidateResponse {
                valid: true,
                errors: vec![],
            })),
            Err(e) => Ok(Response::new(ValidateResponse {
                valid: false,
                errors: vec![e.to_string()],
            })),
        }
    }
    
    type StreamingInferenceStream = Pin<Box<dyn Stream<Item = Result<InferenceResponse, Status>> + Send>>;
    
    async fn streaming_inference(
        &self,
        request: Request<tonic::Streaming<InferenceRequest>>,
    ) -> Result<Response<Self::StreamingInferenceStream>, Status> {
        let mut stream = request.into_inner();
        
        let output_stream = async_stream::try_stream! {
            while let Some(req) = stream.message().await? {
                // Process inference chunk
                // This is a placeholder - implement actual streaming inference
                yield InferenceResponse {
                    output_data: vec![],
                    is_last: false,
                    error: "".to_string(),
                };
            }
            
            // Final response
            yield InferenceResponse {
                output_data: vec![],
                is_last: true,
                error: "".to_string(),
            };
        };
        
        Ok(Response::new(Box::pin(output_stream)))
    }
}

/// Start gRPC server
pub async fn start_grpc_server(
    hub: Arc<EngineHub>,
    port: u16,
) -> Result<(), Box<dyn std::error::Error>> {
    let addr = format!("[::]:{}", port).parse()?;
    let service = GrpcEngineService::new(hub);
    
    info!("Starting gRPC server on {}", addr);
    
    tonic::transport::Server::builder()
        .add_service(crate::grpc::proto::engine_service_server::EngineServiceServer::new(service))
        .serve(addr)
        .await?;
    
    Ok(())
}
