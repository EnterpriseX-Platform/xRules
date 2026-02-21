use config::{Config as ConfigBuilder, Environment, File};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Config {
    pub server: ServerConfig,
    pub grpc: GrpcConfig,
    pub database: DatabaseConfig,
    pub redis: RedisConfig,
    pub kafka: KafkaConfig,
    pub log: LogConfig,
    pub execution: ExecutionConfig,
    pub metrics: MetricsConfig,
    pub security: SecurityConfig,
    pub features: FeatureFlags,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub worker_threads: usize,
    pub max_concurrent_executions: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GrpcConfig {
    pub max_message_size: usize,
    pub keepalive_timeout: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
    pub min_connections: u32,
    pub connect_timeout: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct RedisConfig {
    pub url: String,
    pub pool_size: usize,
    pub timeout: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct KafkaConfig {
    pub brokers: String,
    pub topic_executions: String,
    pub topic_logs: String,
    pub group_id: String,
    pub security_protocol: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct LogConfig {
    pub level: String,
    pub format: String,
    pub file_path: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ExecutionConfig {
    pub timeout_seconds: u64,
    pub max_retry_attempts: u32,
    pub retry_delay_seconds: u64,
    pub dead_letter_queue: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct MetricsConfig {
    pub enabled: bool,
    pub port: u16,
    pub endpoint: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SecurityConfig {
    pub encryption_key: String,
    pub hmac_secret: String,
    pub api_key_validation: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FeatureFlags {
    pub enable_streaming: bool,
    pub enable_scheduling: bool,
    pub enable_caching: bool,
    pub enable_metrics: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            server: ServerConfig {
                host: "0.0.0.0".to_string(),
                port: 50051,
                worker_threads: 8,
                max_concurrent_executions: 100,
            },
            grpc: GrpcConfig {
                max_message_size: 16 * 1024 * 1024,
                keepalive_timeout: 20,
            },
            database: DatabaseConfig {
                url: "postgres://postgres:postgres@localhost:5432/xrules".to_string(),
                max_connections: 20,
                min_connections: 5,
                connect_timeout: 10,
            },
            redis: RedisConfig {
                url: "redis://localhost:6379".to_string(),
                pool_size: 10,
                timeout: 5,
            },
            kafka: KafkaConfig {
                brokers: "localhost:9092".to_string(),
                topic_executions: "xrules-executions".to_string(),
                topic_logs: "xrules-logs".to_string(),
                group_id: "xrules-engine".to_string(),
                security_protocol: "PLAINTEXT".to_string(),
            },
            log: LogConfig {
                level: "info".to_string(),
                format: "json".to_string(),
                file_path: None,
            },
            execution: ExecutionConfig {
                timeout_seconds: 300,
                max_retry_attempts: 3,
                retry_delay_seconds: 5,
                dead_letter_queue: true,
            },
            metrics: MetricsConfig {
                enabled: true,
                port: 9090,
                endpoint: "/metrics".to_string(),
            },
            security: SecurityConfig {
                encryption_key: "default-key-change-in-production!!".to_string(),
                hmac_secret: "default-secret-change-in-production!".to_string(),
                api_key_validation: true,
            },
            features: FeatureFlags {
                enable_streaming: true,
                enable_scheduling: true,
                enable_caching: true,
                enable_metrics: true,
            },
        }
    }
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        dotenvy::dotenv().ok();
        
        let builder = ConfigBuilder::builder()
            .add_source(File::with_name("xrules-engine").required(false))
            .add_source(File::with_name("config").required(false))
            .add_source(Environment::with_prefix("ENGINE").separator("_"))
            .set_default("server.host", "0.0.0.0")?
            .set_default("server.port", 50051i64)?
            .set_default("server.worker_threads", 8i64)?
            .set_default("server.max_concurrent_executions", 100i64)?;
        
        let config = builder.build()?;
        Ok(config.try_deserialize()?)
    }
    
    pub fn grpc_addr(&self) -> String {
        format!("{}:{}", self.server.host, self.server.port)
    }
    
    pub fn metrics_addr(&self) -> String {
        format!("{}:{}", self.server.host, self.metrics.port)
    }
}
