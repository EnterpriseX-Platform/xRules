use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Connection configuration for external services
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Connection {
    pub id: Uuid,
    pub project_id: Uuid,
    pub name: String,
    pub connection_type: ConnectionType,
    pub config: ConnectionConfig,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<chrono::DateTime<chrono::Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

/// Types of connections supported
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionType {
    Database,
    Http,
    Sftp,
    Redis,
    Kafka,
    S3,
    Smtp,
    GraphQL,
    Soap,
    Rest,
    Custom,
}

impl ConnectionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            ConnectionType::Database => "database",
            ConnectionType::Http => "http",
            ConnectionType::Sftp => "sftp",
            ConnectionType::Redis => "redis",
            ConnectionType::Kafka => "kafka",
            ConnectionType::S3 => "s3",
            ConnectionType::Smtp => "smtp",
            ConnectionType::GraphQL => "graphql",
            ConnectionType::Soap => "soap",
            ConnectionType::Rest => "rest",
            ConnectionType::Custom => "custom",
        }
    }
}

/// Connection-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ConnectionConfig {
    Database(DatabaseConfig),
    Http(HttpConfig),
    Sftp(SftpConfig),
    Redis(RedisConnectionConfig),
    Kafka(KafkaConnectionConfig),
    S3(S3Config),
    #[serde(other)]
    Unknown,
}

/// Database connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub db_type: DatabaseType,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl_mode: Option<SslMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection_string: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pool_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseType {
    PostgreSQL,
    MySQL,
    SQLite,
    Oracle,
    MsSQL,
    MongoDB,
}

impl DatabaseType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DatabaseType::PostgreSQL => "postgresql",
            DatabaseType::MySQL => "mysql",
            DatabaseType::SQLite => "sqlite",
            DatabaseType::Oracle => "oracle",
            DatabaseType::MsSQL => "mssql",
            DatabaseType::MongoDB => "mongodb",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SslMode {
    Disable,
    Allow,
    Prefer,
    Require,
    VerifyCa,
    VerifyFull,
}

/// HTTP connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpConfig {
    pub base_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<AuthType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_header: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub oauth2_config: Option<OAuth2Config>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verify_ssl: Option<bool>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthType {
    None,
    Basic,
    Bearer,
    ApiKey,
    OAuth2,
    Digest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuth2Config {
    pub client_id: String,
    pub client_secret: String,
    pub token_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
}

/// SFTP connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SftpConfig {
    pub host: String,
    pub port: u16,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub private_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub passphrase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
}

/// Redis connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RedisConnectionConfig {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pool_size: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_tls: Option<bool>,
}

/// Kafka connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KafkaConnectionConfig {
    pub brokers: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sasl_username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sasl_password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub security_protocol: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ssl_enabled: Option<bool>,
}

/// S3 connection configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub bucket: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path_style: Option<bool>,
}

impl Connection {
    /// Create a new connection
    pub fn new(
        project_id: Uuid,
        name: impl Into<String>,
        connection_type: ConnectionType,
        config: ConnectionConfig,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            project_id,
            name: name.into(),
            connection_type,
            config,
            status: Some("active".to_string()),
            created_at: Some(chrono::Utc::now()),
            updated_at: Some(chrono::Utc::now()),
        }
    }
    
    /// Get connection string for database connections
    pub fn get_connection_string(&self) -> Option<String> {
        match &self.config {
            ConnectionConfig::Database(config) => {
                if let Some(conn_str) = &config.connection_string {
                    return Some(conn_str.clone());
                }
                
                let conn_str = format!(
                    "{}://{}:{}@{}:{}/{}",
                    config.db_type.as_str(),
                    config.username,
                    config.password.as_deref().unwrap_or(""),
                    config.host,
                    config.port,
                    config.database
                );
                Some(conn_str)
            }
            _ => None,
        }
    }
    
    /// Validate the connection configuration
    pub fn validate(&self) -> Result<(), Vec<String>> {
        let mut errors = Vec::new();
        
        match &self.config {
            ConnectionConfig::Database(config) => {
                if config.host.is_empty() {
                    errors.push("Database host cannot be empty".to_string());
                }
                if config.database.is_empty() {
                    errors.push("Database name cannot be empty".to_string());
                }
                if config.username.is_empty() {
                    errors.push("Database username cannot be empty".to_string());
                }
            }
            ConnectionConfig::Http(config) => {
                if config.base_url.is_empty() {
                    errors.push("HTTP base URL cannot be empty".to_string());
                }
                if !config.base_url.starts_with("http://") && !config.base_url.starts_with("https://") {
                    errors.push("HTTP base URL must start with http:// or https://".to_string());
                }
            }
            ConnectionConfig::Sftp(config) => {
                if config.host.is_empty() {
                    errors.push("SFTP host cannot be empty".to_string());
                }
                if config.username.is_empty() {
                    errors.push("SFTP username cannot be empty".to_string());
                }
                if config.password.is_none() && config.private_key.is_none() {
                    errors.push("SFTP connection must have password or private_key".to_string());
                }
            }
            _ => {}
        }
        
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}
