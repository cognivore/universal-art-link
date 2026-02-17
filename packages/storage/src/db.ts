import pg from 'pg';

const { Pool } = pg;

export type DbPool = pg.Pool;
export type DbClient = pg.PoolClient;

/** Create a connection pool from DATABASE_URL or explicit config. */
export const createPool = (connectionString?: string): DbPool =>
  new Pool({
    connectionString: connectionString ?? process.env['DATABASE_URL'],
    max: 20,
    idleTimeoutMillis: 30_000,
  });

/**
 * Execute a query scoped to a transaction.
 * Acquires a client, runs the callback, and releases.
 * Rolls back on error.
 */
export const withTransaction = async <T>(
  pool: DbPool,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
