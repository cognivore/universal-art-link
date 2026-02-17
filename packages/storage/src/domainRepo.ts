import type { DbPool } from './db.js';
import type { Domain, DomainStatus } from '@ual/core';

const rowToDomain = (r: Record<string, unknown>): Domain => ({
  id: r['id'] as string,
  tenantId: r['tenant_id'] as string,
  hostname: r['hostname'] as string,
  status: r['status'] as DomainStatus,
  provisioningLog: r['provisioning_log'] ?? null,
  createdAt: new Date(r['created_at'] as string),
});

export const createDomainRepo = (pool: DbPool) => ({
  async create(tenantId: string, hostname: string): Promise<Domain> {
    const { rows } = await pool.query(
      `INSERT INTO domains (tenant_id, hostname) VALUES ($1, $2) RETURNING *`,
      [tenantId, hostname],
    );
    return rowToDomain(rows[0]!);
  },

  async findByHostname(hostname: string): Promise<Domain | null> {
    const { rows } = await pool.query(
      'SELECT * FROM domains WHERE hostname = $1',
      [hostname],
    );
    return rows[0] ? rowToDomain(rows[0]) : null;
  },

  async listByTenant(tenantId: string): Promise<ReadonlyArray<Domain>> {
    const { rows } = await pool.query(
      'SELECT * FROM domains WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows.map(rowToDomain);
  },

  async updateStatus(id: string, status: DomainStatus, log?: unknown): Promise<void> {
    await pool.query(
      `UPDATE domains SET status = $1, provisioning_log = COALESCE($2, provisioning_log) WHERE id = $3`,
      [status, log ? JSON.stringify(log) : null, id],
    );
  },
});

export type DomainRepo = ReturnType<typeof createDomainRepo>;
