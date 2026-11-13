use crate::grpc::proto::{
    engine_service_client::EngineServiceClient, ExecuteRequest, ExecuteResponse,
    HealthCheckRequest, HealthCheckResponse,
};
use tonic::transport::Channel;

/// gRPC client for Engine Service
pub struct GrpcEngineClient {
    client: EngineServiceClient<Channel>,
}

impl GrpcEngineClient {
    /// Create new gRPC client
    pub async fn new(addr: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let client = EngineServiceClient::connect(addr.to_string()).await?;
        Ok(Self { client })
    }

    /// Execute a rule via gRPC
    pub async fn execute(
        &mut self,
        rule_id: &str,
        input: serde_json::Value,
    ) -> Result<ExecuteResponse, Box<dyn std::error::Error>> {
        let request = ExecuteRequest {
            rule_id: rule_id.to_string(),
            input: serde_json::to_vec(&input)?,
            context: std::collections::HashMap::new(),
            engine_type: "rules".to_string(),
            rule_type: "DECISION_TABLE".to_string(),
            definition: vec![],
        };

        let response = self.client.execute(request).await?;
        Ok(response.into_inner())
    }

    /// Health check
    pub async fn health_check(
        &mut self,
    ) -> Result<HealthCheckResponse, Box<dyn std::error::Error>> {
        let request = HealthCheckRequest {};
        let response = self.client.health_check(request).await?;
        Ok(response.into_inner())
    }
}
