CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clusters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    mode VARCHAR(20) NOT NULL DEFAULT 'standalone',
    addrs JSONB NOT NULL,
    password VARCHAR(255) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_clusters_deleted_at ON clusters(deleted_at);
CREATE INDEX idx_clusters_status ON clusters(status);

CREATE TABLE IF NOT EXISTS cluster_nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_id VARCHAR(64) DEFAULT '',
    addr VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'slave',
    slots TEXT DEFAULT '',
    master_id VARCHAR(64) DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'offline',
    memory BIGINT DEFAULT 0,
    connected_clients INT DEFAULT 0,
    latency_ms DOUBLE PRECISION DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cluster_nodes_cluster_id ON cluster_nodes(cluster_id);
CREATE INDEX idx_cluster_nodes_status ON cluster_nodes(status);
CREATE UNIQUE INDEX idx_cluster_nodes_cluster_addr ON cluster_nodes(cluster_id, addr);

CREATE TABLE IF NOT EXISTS slowlog_entries (
    id BIGSERIAL PRIMARY KEY,
    cluster_id UUID NOT NULL REFERENCES clusters(id) ON DELETE CASCADE,
    node_addr VARCHAR(255) NOT NULL,
    slowlog_id BIGINT NOT NULL,
    command VARCHAR(500) NOT NULL,
    command_fingerprint VARCHAR(500) NOT NULL DEFAULT '',
    duration_us BIGINT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    args TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_slowlog_entries_cluster_id ON slowlog_entries(cluster_id);
CREATE INDEX idx_slowlog_entries_node_addr ON slowlog_entries(node_addr);
CREATE INDEX idx_slowlog_entries_command ON slowlog_entries(command);
CREATE INDEX idx_slowlog_entries_command_fingerprint ON slowlog_entries(command_fingerprint);
CREATE INDEX idx_slowlog_entries_occurred_at ON slowlog_entries(occurred_at);
CREATE INDEX idx_slowlog_entries_duration ON slowlog_entries(duration_us);
CREATE INDEX idx_slowlog_entries_cluster_node ON slowlog_entries(cluster_id, node_addr);
