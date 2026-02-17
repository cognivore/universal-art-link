import type { DbPool } from './db.js';
import type { StripeConnection, StripeMode } from '@ual/core';

const rowToConnection = (r: Record<string, unknown>): StripeConnection => ({
  tenantId: r['tenant_id'] as string,
  mode: r['mode'] as StripeMode,
  connectAccountId: (r['connect_account_id'] as string) ?? null,
  encryptedRestrictedKey: r['encrypted_restricted_key']
    ? new Uint8Array(r['encrypted_restricted_key'] as Buffer)
    : null,
  createdAt: new Date(r['created_at'] as string),
  updatedAt: new Date(r['updated_at'] as string),
});

export const createStripeConnectionRepo = (pool: DbPool) => ({
  async get(tenantId: string): Promise<StripeConnection | null> {
    const { rows } = await pool.query(
      'SELECT * FROM stripe_connections WHERE tenant_id = $1',
      [tenantId],
    );
    return rows[0] ? rowToConnection(rows[0]) : null;
  },

  async upsert(
    tenantId: string,
    mode: StripeMode,
    connectAccountId?: string,
    encryptedKey?: Uint8Array,
  ): Promise<StripeConnection> {
    const { rows } = await pool.query(
      `INSERT INTO stripe_connections (tenant_id, mode, connect_account_id, encrypted_restricted_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id) DO UPDATE
       SET mode = $2, connect_account_id = $3, encrypted_restricted_key = $4, updated_at = now()
       RETURNING *`,
      [tenantId, mode, connectAccountId ?? null, encryptedKey ? Buffer.from(encryptedKey) : null],
    );
    return rowToConnection(rows[0]!);
  },
});

export type StripeConnectionRepo = ReturnType<typeof createStripeConnectionRepo>;
