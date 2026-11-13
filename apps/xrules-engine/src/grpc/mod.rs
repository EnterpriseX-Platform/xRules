pub mod client;
pub mod server;

// Include generated proto code
pub mod proto {
    tonic::include_proto!("xrules.engine.v1");
}
