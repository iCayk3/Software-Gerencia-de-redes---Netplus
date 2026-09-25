-- ============================================================================
-- NetPulse B2B Enterprise Schema
-- Multi-Tenant PostgreSQL Schema with RBAC & Audit Trail
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenants (Provedores / Clientes B2B)
CREATE TABLE IF NOT EXISTS tenants (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    asn VARCHAR(20) NOT NULL DEFAULT '',
    document VARCHAR(50) NOT NULL DEFAULT '',
    contact_email VARCHAR(255) NOT NULL DEFAULT '',
    contact_phone VARCHAR(50) NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    plan VARCHAR(50) NOT NULL DEFAULT 'enterprise',
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS asn VARCHAR(20) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS document VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50) NOT NULL DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS logo_url TEXT NOT NULL DEFAULT '';

-- 2. Users (Usuários e Papéis RBAC)
-- Papéis: 'admin', 'noc_operator', 'viewer'
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 3. Devices (Inventário de Roteadores por Tenant)
CREATE TABLE IF NOT EXISTS devices (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    host VARCHAR(100) NOT NULL,
    port INT NOT NULL DEFAULT 22,
    vendor VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    username VARCHAR(100) NOT NULL,
    password TEXT NOT NULL,
    auth_type VARCHAR(50) NOT NULL DEFAULT 'password',
    is_bgp BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'unknown',
    last_seen TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_tenant ON devices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_devices_is_bgp ON devices(is_bgp);

-- 4. AS Metadata (Personalização de ASNs)
CREATE TABLE IF NOT EXISTS as_metadata (
    asn VARCHAR(20) NOT NULL,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alias VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'transit_primary',
    color VARCHAR(50) DEFAULT 'indigo',
    custom_gateway VARCHAR(100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (asn, tenant_id)
);

-- 5. Audit Trail (Trilha de Auditoria Imutável Append-Only)
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_id VARCHAR(64) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    client_ip VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    target_device_id VARCHAR(64),
    target_device_name VARCHAR(255),
    command_executed TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'SUCCESS',
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_logs(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_device ON audit_logs(target_device_id);

-- 6. Alerts (Incidentes e Telemetria)
CREATE TABLE IF NOT EXISTS alerts (
    id VARCHAR(64) PRIMARY KEY,
    tenant_id VARCHAR(64) NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_id VARCHAR(64) REFERENCES devices(id) ON DELETE SET NULL,
    device_name VARCHAR(255),
    type VARCHAR(50) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alerts_tenant_time ON alerts(tenant_id, timestamp DESC);

-- ============================================================================
-- Seed Inicial (Tenant Padrão / NOC Central e Tenant Cliente)
-- ============================================================================
INSERT INTO tenants (id, name, slug, asn, plan, status)
VALUES 
    ('default-tenant', 'Netpulse Telecom (NOC Central)', 'netplus', '267943', 'enterprise', 'active'),
    ('tenant-alpha', 'Alpha Fibra Internet (Cliente)', 'alpha-fibra', '53001', 'enterprise', 'active')
ON CONFLICT (id) DO NOTHING;
