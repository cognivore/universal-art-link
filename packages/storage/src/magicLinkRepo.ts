import type { DbPool } from './db.js';

export type MagicLinkToken = {
  readonly id: string;
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
};

const rowToToken = (r: Record<string, unknown>): MagicLinkToken => ({
  id: r['id'] as string,
  userId: r['user_id'] as string,
  tokenHash: r['token_hash'] as string,
  expiresAt: new Date(r['expires_at'] as string),
  usedAt: r['used_at'] ? new Date(r['used_at'] as string) : null,
  createdAt: new Date(r['created_at'] as string),
});

export const createMagicLinkRepo = (pool: DbPool) => ({
  async create(userId: string, tokenHash: string, expiresAt: Date): Promise<MagicLinkToken> {
    const { rows } = await pool.query(
      `INSERT INTO magic_link_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3) RETURNING *`,
      [userId, tokenHash, expiresAt.toISOString()],
    );
    return rowToToken(rows[0]!);
  },

  async findByHash(tokenHash: string): Promise<MagicLinkToken | null> {
    const { rows } = await pool.query(
      'SELECT * FROM magic_link_tokens WHERE token_hash = $1',
      [tokenHash],
    );
    return rows[0] ? rowToToken(rows[0]) : null;
  },

  async markUsed(id: string): Promise<void> {
    await pool.query(
      'UPDATE magic_link_tokens SET used_at = now() WHERE id = $1',
      [id],
    );
  },
});

export type MagicLinkRepo = ReturnType<typeof createMagicLinkRepo>;
