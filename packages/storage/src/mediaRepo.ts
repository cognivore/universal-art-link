import type { DbPool } from './db.js';
import type { MediaAsset, FocalPoint } from '@ual/core';

const rowToMediaAsset = (r: Record<string, unknown>): MediaAsset => ({
  id: r['id'] as string,
  tenantId: r['tenant_id'] as string,
  storageKey: r['storage_key'] as string,
  mime: r['mime'] as string,
  width: (r['width'] as number) ?? null,
  height: (r['height'] as number) ?? null,
  alt: (r['alt'] as string) ?? null,
  caption: (r['caption'] as string) ?? null,
  credit: (r['credit'] as string) ?? null,
  focalPoint: (r['focal_point'] as FocalPoint) ?? null,
  createdAt: new Date(r['created_at'] as string),
});

export const createMediaRepo = (pool: DbPool) => ({
  async create(
    tenantId: string,
    storageKey: string,
    mime: string,
    width?: number,
    height?: number,
  ): Promise<MediaAsset> {
    const { rows } = await pool.query(
      `INSERT INTO media_assets (tenant_id, storage_key, mime, width, height)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, storageKey, mime, width ?? null, height ?? null],
    );
    return rowToMediaAsset(rows[0]!);
  },

  async findById(id: string, tenantId: string): Promise<MediaAsset | null> {
    const { rows } = await pool.query(
      'SELECT * FROM media_assets WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    return rows[0] ? rowToMediaAsset(rows[0]) : null;
  },

  async listByTenant(tenantId: string): Promise<ReadonlyArray<MediaAsset>> {
    const { rows } = await pool.query(
      'SELECT * FROM media_assets WHERE tenant_id = $1 ORDER BY created_at DESC',
      [tenantId],
    );
    return rows.map(rowToMediaAsset);
  },

  async updateMetadata(
    id: string,
    tenantId: string,
    meta: { alt?: string; caption?: string; credit?: string; focalPoint?: FocalPoint },
  ): Promise<void> {
    await pool.query(
      `UPDATE media_assets
       SET alt = COALESCE($3, alt),
           caption = COALESCE($4, caption),
           credit = COALESCE($5, credit),
           focal_point = COALESCE($6, focal_point)
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, meta.alt ?? null, meta.caption ?? null, meta.credit ?? null, meta.focalPoint ? JSON.stringify(meta.focalPoint) : null],
    );
  },
});

export type MediaRepo = ReturnType<typeof createMediaRepo>;
