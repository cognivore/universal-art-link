-- UAL v2 initial schema
-- All tables tenant-scoped (except tenants + users themselves)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- tenants
-- ============================================================
CREATE TABLE tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'suspended')),
  slug         TEXT NOT NULL UNIQUE,
  primary_domain TEXT,
  mode         TEXT NOT NULL DEFAULT 'self_host'
                 CHECK (mode IN ('hosted', 'self_host')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- users
-- ============================================================
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'active', 'disabled')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- memberships
-- ============================================================
CREATE TABLE memberships (
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'editor'
               CHECK (role IN ('owner', 'editor', 'viewer', 'meta_admin')),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX idx_memberships_user ON memberships(user_id);

-- ============================================================
-- magic_link_tokens (passwordless auth)
-- ============================================================
CREATE TABLE magic_link_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_tokens_hash ON magic_link_tokens(token_hash);

-- ============================================================
-- draft_docs
-- ============================================================
CREATE TABLE draft_docs (
  tenant_id   UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  doc_version INT NOT NULL DEFAULT 1,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- crdt_updates
-- ============================================================
CREATE TABLE crdt_updates (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_version INT NOT NULL,
  seq         BIGSERIAL,
  update_data BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_crdt_updates_lookup
  ON crdt_updates(tenant_id, doc_version, seq);

-- ============================================================
-- snapshots
-- ============================================================
CREATE TABLE snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  doc_version INT NOT NULL,
  label       TEXT,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  yjs_state   BYTEA NOT NULL,
  site_json   JSONB
);

CREATE INDEX idx_snapshots_tenant ON snapshots(tenant_id, created_at DESC);

-- ============================================================
-- published_revisions
-- ============================================================
CREATE TABLE published_revisions (
  tenant_id    UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_id  UUID NOT NULL REFERENCES snapshots(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by UUID REFERENCES users(id)
);

-- ============================================================
-- publish_jobs
-- ============================================================
CREATE TABLE publish_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES snapshots(id),
  status      TEXT NOT NULL DEFAULT 'queued'
                CHECK (status IN ('queued', 'running', 'success', 'failed')),
  log         JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX idx_publish_jobs_tenant ON publish_jobs(tenant_id, created_at DESC);

-- ============================================================
-- stripe_connections
-- ============================================================
CREATE TABLE stripe_connections (
  tenant_id             UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  mode                  TEXT NOT NULL DEFAULT 'payment_links'
                          CHECK (mode IN ('payment_links', 'connect', 'restricted_key')),
  connect_account_id    TEXT,
  encrypted_restricted_key BYTEA,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- domains
-- ============================================================
CREATE TABLE domains (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hostname         TEXT NOT NULL UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'error')),
  provisioning_log JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_domains_tenant ON domains(tenant_id);
CREATE INDEX idx_domains_hostname ON domains(hostname);

-- ============================================================
-- media_assets
-- ============================================================
CREATE TABLE media_assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  mime        TEXT NOT NULL,
  width       INT,
  height      INT,
  alt         TEXT,
  caption     TEXT,
  credit      TEXT,
  focal_point JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_assets_tenant ON media_assets(tenant_id, created_at DESC);
