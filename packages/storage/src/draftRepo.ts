import type { DbPool, DbClient } from './db.js';

export type DraftDoc = {
  readonly tenantId: string;
  readonly docVersion: number;
  readonly updatedAt: Date;
};

export type CrdtUpdate = {
  readonly tenantId: string;
  readonly docVersion: number;
  readonly seq: bigint;
  readonly updateData: Uint8Array;
  readonly createdAt: Date;
};

export const createDraftRepo = (pool: DbPool) => ({
  async ensureDraft(tenantId: string): Promise<DraftDoc> {
    const { rows } = await pool.query(
      `INSERT INTO draft_docs (tenant_id) VALUES ($1)
       ON CONFLICT (tenant_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [tenantId],
    );
    const r = rows[0]!;
    return {
      tenantId: r['tenant_id'] as string,
      docVersion: r['doc_version'] as number,
      updatedAt: new Date(r['updated_at'] as string),
    };
  },

  async getDraft(tenantId: string): Promise<DraftDoc | null> {
    const { rows } = await pool.query(
      'SELECT * FROM draft_docs WHERE tenant_id = $1',
      [tenantId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      tenantId: r['tenant_id'] as string,
      docVersion: r['doc_version'] as number,
      updatedAt: new Date(r['updated_at'] as string),
    };
  },

  async incrementVersion(tenantId: string, client?: DbClient): Promise<number> {
    const q = client ?? pool;
    const { rows } = await q.query(
      `UPDATE draft_docs
       SET doc_version = doc_version + 1, updated_at = now()
       WHERE tenant_id = $1
       RETURNING doc_version`,
      [tenantId],
    );
    return rows[0]!['doc_version'] as number;
  },

  async appendUpdate(tenantId: string, docVersion: number, data: Uint8Array): Promise<void> {
    await pool.query(
      `INSERT INTO crdt_updates (tenant_id, doc_version, update_data)
       VALUES ($1, $2, $3)`,
      [tenantId, docVersion, Buffer.from(data)],
    );
    await pool.query(
      'UPDATE draft_docs SET updated_at = now() WHERE tenant_id = $1',
      [tenantId],
    );
  },

  async getUpdates(tenantId: string, docVersion: number, afterSeq?: bigint): Promise<ReadonlyArray<CrdtUpdate>> {
    const condition = afterSeq != null
      ? 'AND seq > $3'
      : '';
    const params: unknown[] = [tenantId, docVersion];
    if (afterSeq != null) params.push(afterSeq.toString());

    const { rows } = await pool.query(
      `SELECT * FROM crdt_updates
       WHERE tenant_id = $1 AND doc_version = $2 ${condition}
       ORDER BY seq ASC`,
      params,
    );

    return rows.map((r) => ({
      tenantId: r['tenant_id'] as string,
      docVersion: r['doc_version'] as number,
      seq: BigInt(r['seq'] as string),
      updateData: new Uint8Array(r['update_data'] as Buffer),
      createdAt: new Date(r['created_at'] as string),
    }));
  },

  async deleteUpdatesForVersion(tenantId: string, docVersion: number, client?: DbClient): Promise<void> {
    const q = client ?? pool;
    await q.query(
      'DELETE FROM crdt_updates WHERE tenant_id = $1 AND doc_version = $2',
      [tenantId, docVersion],
    );
  },
});

export type DraftRepo = ReturnType<typeof createDraftRepo>;
