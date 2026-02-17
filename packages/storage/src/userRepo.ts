import type { DbPool } from './db.js';
import type { User, Membership, UserWithMemberships, UserStatus } from '@ual/core';

const rowToUser = (row: Record<string, unknown>): User => ({
  id: row['id'] as string,
  email: row['email'] as string,
  status: row['status'] as User['status'],
  createdAt: new Date(row['created_at'] as string),
});

const rowToMembership = (row: Record<string, unknown>): Membership => ({
  tenantId: row['tenant_id'] as string,
  userId: row['user_id'] as string,
  role: row['role'] as Membership['role'],
});

export const createUserRepo = (pool: DbPool) => ({
  async create(email: string, status: UserStatus = 'pending'): Promise<User> {
    const { rows } = await pool.query(
      `INSERT INTO users (email, status) VALUES ($1, $2) RETURNING *`,
      [email, status],
    );
    return rowToUser(rows[0]!);
  },

  async findById(id: string): Promise<User | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async findByEmail(email: string): Promise<User | null> {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return rows[0] ? rowToUser(rows[0]) : null;
  },

  async updateStatus(id: string, status: UserStatus): Promise<void> {
    await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);
  },

  async findWithMemberships(userId: string): Promise<UserWithMemberships | null> {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (!userResult.rows[0]) return null;

    const membResult = await pool.query(
      'SELECT * FROM memberships WHERE user_id = $1',
      [userId],
    );

    return {
      ...rowToUser(userResult.rows[0]),
      memberships: membResult.rows.map(rowToMembership),
    };
  },

  async addMembership(tenantId: string, userId: string, role: Membership['role']): Promise<void> {
    await pool.query(
      `INSERT INTO memberships (tenant_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = $3`,
      [tenantId, userId, role],
    );
  },

  async getMemberships(userId: string): Promise<ReadonlyArray<Membership>> {
    const { rows } = await pool.query(
      'SELECT * FROM memberships WHERE user_id = $1',
      [userId],
    );
    return rows.map(rowToMembership);
  },

  async getTenantMembers(tenantId: string): Promise<ReadonlyArray<Membership>> {
    const { rows } = await pool.query(
      'SELECT * FROM memberships WHERE tenant_id = $1',
      [tenantId],
    );
    return rows.map(rowToMembership);
  },

  async listPending(): Promise<ReadonlyArray<User>> {
    const { rows } = await pool.query(
      "SELECT * FROM users WHERE status = 'pending' ORDER BY created_at DESC",
    );
    return rows.map(rowToUser);
  },
});

export type UserRepo = ReturnType<typeof createUserRepo>;
