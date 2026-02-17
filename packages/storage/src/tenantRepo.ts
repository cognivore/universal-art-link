import type { DbPool } from './db.js';
import type { Tenant, CreateTenantInput, TenantStatus } from '@ual/core';

const rowToTenant = (row: Record<string, unknown>): Tenant => ({
  id: row['id'] as string,
  status: row['status'] as Tenant['status'],
  slug: row['slug'] as string,
  primaryDomain: (row['primary_domain'] as string) ?? null,
  mode: row['mode'] as Tenant['mode'],
  createdAt: new Date(row['created_at'] as string),
});

export const createTenantRepo = (pool: DbPool) => ({
  async create(input: CreateTenantInput): Promise<Tenant> {
    const { rows } = await pool.query(
      `INSERT INTO tenants (slug, mode, primary_domain)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [input.slug, input.mode, input.primaryDomain ?? null],
    );
    return rowToTenant(rows[0]!);
  },

  async findById(id: string): Promise<Tenant | null> {
    const { rows } = await pool.query('SELECT * FROM tenants WHERE id = $1', [id]);
    return rows[0] ? rowToTenant(rows[0]) : null;
  },

  async findBySlug(slug: string): Promise<Tenant | null> {
    const { rows } = await pool.query('SELECT * FROM tenants WHERE slug = $1', [slug]);
    return rows[0] ? rowToTenant(rows[0]) : null;
  },

  async findByDomain(hostname: string): Promise<Tenant | null> {
    const { rows } = await pool.query(
      `SELECT t.* FROM tenants t
       JOIN domains d ON d.tenant_id = t.id
       WHERE d.hostname = $1 AND d.status = 'active'
       LIMIT 1`,
      [hostname],
    );
    return rows[0] ? rowToTenant(rows[0]) : null;
  },

  async listAll(): Promise<ReadonlyArray<Tenant>> {
    const { rows } = await pool.query('SELECT * FROM tenants ORDER BY created_at DESC');
    return rows.map(rowToTenant);
  },

  async updateStatus(id: string, status: TenantStatus): Promise<void> {
    await pool.query('UPDATE tenants SET status = $1 WHERE id = $2', [status, id]);
  },
});

export type TenantRepo = ReturnType<typeof createTenantRepo>;
