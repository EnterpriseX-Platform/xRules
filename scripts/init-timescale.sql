-- TimescaleDB Setup for XRules Analytics

-- Enable TimescaleDB
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Execution logs table (hypertable)
CREATE TABLE IF NOT EXISTS rule_executions (
    id TEXT PRIMARY KEY,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    rule_type TEXT,
    engine TEXT NOT NULL,
    input JSONB,
    output JSONB,
    duration_ms INTEGER,
    status TEXT,  -- success, error, timeout
    error_message TEXT,
    user_id TEXT,
    workspace_id TEXT,
    project_id TEXT,
    trace_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert to hypertable
SELECT create_hypertable('rule_executions', 'timestamp', 
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_exec_rule_id ON rule_executions (rule_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exec_user ON rule_executions (user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_exec_status ON rule_executions (status, timestamp DESC);

-- Continuous aggregate: Hourly stats
CREATE MATERIALIZED VIEW IF NOT EXISTS rule_stats_hourly
WITH (timescaledb.continuous) AS
SELECT 
    time_bucket('1 hour', timestamp) as bucket,
    rule_id,
    COUNT(*) as execution_count,
    AVG(duration_ms) as avg_latency,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_latency,
    MAX(duration_ms) as max_latency,
    COUNT(*) FILTER (WHERE status = 'error') as error_count
FROM rule_executions
GROUP BY bucket, rule_id;

-- Retention: 90 days
SELECT add_retention_policy('rule_executions', INTERVAL '90 days', if_not_exists => TRUE);
