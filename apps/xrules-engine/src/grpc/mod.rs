pub mod client;
pub mod server;

// Include generated proto code
pub mod proto {
    tonic::include_proto!("xrules.engine.v1");
}

pub use proto::engine_service_client::EngineServiceClient;
pub use proto::engine_service_server::{EngineService, EngineServiceServer};
