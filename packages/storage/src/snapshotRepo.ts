import type { DbPool } from './db.js';
import type { Snapshot, PublishedRevision, PublishJob, PublishJobStatus } from '@ual/core';

const rowToSnapshot = (r: Record<string, unknown>): Snapshot => ({
  id: r['id'] as string,
  tenantId: r['tenant_id'] as string,
  docVersion: r['doc_version'] as number,
  label: (r['label'] as string) ?? null,
  createdBy: (r['created_by'] as string) ?? null,
  createdAt: new Date(r['created_at'] as string),
  yjsState: new Uint8Array(r['yjs_state'] as Buffer),
  siteJson: r['site_json'] ?? null,
});

const rowToPublishedRevision = (r: Record<string, unknown>): PublishedRevision => ({
  tenantId: r['tenant_id'] as string,
  snapshotId: r['snapshot_id'] as string,
  publishedAt: new Date(r['published_at'] as string),
  publishedBy: (r['published_by'] as string) ?? null,
});

const rowToPublishJob = (r: Record<string, unknown>): PublishJob => ({
  id: r['id'] as string,
  tenantId: r['tenant_id'] as string,
  snapshotId: r['snapshot_id'] as string,
  status: r['status'] as PublishJobStatus,
  log: r['log'] ?? null,
  createdAt: new Date(r['created_at'] as string),
  startedAt: r['started_at'] ? new Date(r['started_at'] as string) : null,
  finishedAt: r['finished_at'] ? new Date(r['finished_at'] as string) : null,
});

export const createSnapshotRepo = (pool: DbPool) => ({
  async create(
    tenantId: string,
    docVersion: number,
    yjsState: Uint8Array,
    siteJson: unknown,
    label?: string,
    createdBy?: string,
  ): Promise<Snapshot> {
    const { rows } = await pool.query(
      `INSERT INTO snapshots (tenant_id, doc_version, yjs_state, site_json, label, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, docVersion, Buffer.from(yjsState), JSON.stringify(siteJson), label ?? null, createdBy ?? null],
    );
    return rowToSnapshot(rows[0]!);
  },

  async findById(id: string, tenantId: string): Promise<Snapshot | null> {
    const { rows } = await pool.query(
      'SELECT * FROM snapshots WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    return rows[0] ? rowToSnapshot(rows[0]) : null;
  },

  async listByTenant(tenantId: string): Promise<ReadonlyArray<Snapshot>> {
    const { rows } = await pool.query(
      'SELECT * FROM snapshots WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows.map(rowToSnapshot);
  },

  async getPublishedRevision(tenantId: string): Promise<PublishedRevision | null> {
    const { rows } = await pool.query(
      'SELECT * FROM published_revisions WHERE tenant_id = $1',
      [tenantId],
    );
    return rows[0] ? rowToPublishedRevision(rows[0]) : null;
  },

  async setPublishedRevision(tenantId: string, snapshotId: string, publishedBy?: string): Promise<void> {
    await pool.query(
      `INSERT INTO published_revisions (tenant_id, snapshot_id, published_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id) DO UPDATE
       SET snapshot_id = $2, published_at = now(), published_by = $3`,
      [tenantId, snapshotId, publishedBy ?? null],
    );
  },

  async createPublishJob(tenantId: string, snapshotId: string): Promise<PublishJob> {
    const { rows } = await pool.query(
      `INSERT INTO publish_jobs (tenant_id, snapshot_id)
       VALUES ($1, $2) RETURNING *`,
      [tenantId, snapshotId],
    );
    return rowToPublishJob(rows[0]!);
  },

  async updatePublishJob(id: string, status: PublishJobStatus, log?: unknown): Promise<void> {
    const timeCol = status === 'running' ? 'started_at' : 'finished_at';
    await pool.query(
      `UPDATE publish_jobs SET status = $1, log = $2, ${timeCol} = now() WHERE id = $3`,
      [status, log ? JSON.stringify(log) : null, id],
    );
  },

  async getLatestPublishJob(tenantId: string): Promise<PublishJob | null> {
    const { rows } = await pool.query(
      'SELECT * FROM publish_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
      [tenantId],
    );
    return rows[0] ? rowToPublishJob(rows[0]) : null;
  },
});

export type SnapshotRepo = ReturnType<typeof createSnapshotRepo>;
