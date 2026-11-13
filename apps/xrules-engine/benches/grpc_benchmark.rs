use std::time::{Duration, Instant};
use tokio::runtime::Runtime;

// Simple benchmark comparing HTTP vs gRPC performance
// Run with: cargo bench

fn main() {
    println!("XRules Engine - HTTP vs gRPC Benchmark");
    println!("======================================\n");

    let rt = Runtime::new().unwrap();

    // HTTP benchmark
    rt.block_on(async {
        http_benchmark().await;
    });

    // gRPC benchmark
    rt.block_on(async {
        grpc_benchmark().await;
    });
}

async fn http_benchmark() {
    println!("HTTP Benchmark");
    println!("--------------");

    let client = reqwest::Client::new();
    let url = "http://localhost:50051/api/v1/health";

    let iterations = 1000;
    let start = Instant::now();

    for _ in 0..iterations {
        let _ = client.get(url).send().await;
    }

    let duration = start.elapsed();
    let avg_latency = duration.as_millis() as f64 / iterations as f64;
    let rps = iterations as f64 / duration.as_secs_f64();

    println!("  Iterations: {}", iterations);
    println!("  Total time: {:?}", duration);
    println!("  Avg latency: {:.2} ms", avg_latency);
    println!("  Requests/sec: {:.0}", rps);
    println!();
}

async fn grpc_benchmark() {
    println!("gRPC Benchmark");
    println!("--------------");

    // Connect to gRPC server
    let addr = "http://localhost:50060";

    match xrules_engine::grpc::client::GrpcEngineClient::new(addr).await {
        Ok(mut client) => {
            let iterations = 1000;
            let start = Instant::now();

            for _ in 0..iterations {
                let _ = client.health_check().await;
            }

            let duration = start.elapsed();
            let avg_latency = duration.as_millis() as f64 / iterations as f64;
            let rps = iterations as f64 / duration.as_secs_f64();

            println!("  Iterations: {}", iterations);
            println!("  Total time: {:?}", duration);
            println!("  Avg latency: {:.2} ms", avg_latency);
            println!("  Requests/sec: {:.0}", rps);
        }
        Err(e) => {
            println!("  Failed to connect: {}", e);
        }
    }

    println!();
}
