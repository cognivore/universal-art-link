import { createPool } from '@ual/storage';
import { signJwt } from '../../services/api/src/auth.js';
import { TestClient } from './client.js';

const DATABASE_URL = 'postgresql://ual:ual_dev@localhost:5432/ual_test';

/**
 * Extract the host portion from a base URL (e.g. "http://127.0.0.1:5432" -> "127.0.0.1").
 */
const hostFromUrl = (baseUrl: string): string => {
  const u = new URL(baseUrl);
  return u.hostname;
};

/**
 * Directly create a user + tenant + membership + domain in the DB for testing,
 * bypassing the auth flow. Adds a domain record so the tenant resolver can
 * resolve the test hostname. Returns a TestClient with a valid session cookie.
 */
export const createTestTenantWithOwner = async (
  baseUrl: string,
  slug: string,
  email: string,
): Promise<{ client: TestClient; tenantId: string; userId: string }> => {
  const pool = createPool(DATABASE_URL);

  try {
    const { rows: [tenant] } = await pool.query(
      `INSERT INTO tenants (slug, mode, status) VALUES ($1, 'self_host', 'active') RETURNING id`,
      [slug],
    );
    const tenantId = (tenant as { id: string }).id;

    const hostname = hostFromUrl(baseUrl);
    await pool.query(
      `INSERT INTO domains (tenant_id, hostname, status) VALUES ($1, $2, 'active')
       ON CONFLICT (hostname) DO UPDATE SET tenant_id = $1`,
      [tenantId, hostname],
    );

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id`,
      [email],
    );
    const userId = (user as { id: string }).id;

    await pool.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'owner')`,
      [tenantId, userId],
    );

    await pool.query(
      `INSERT INTO draft_docs (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [tenantId],
    );

    const jwt = await signJwt(userId, email);
    const client = new TestClient(baseUrl);
    client.setCookie('ual_session', jwt);

    return { client, tenantId, userId };
  } finally {
    await pool.end();
  }
};

/**
 * Create a meta-admin user. Returns a TestClient with a valid session.
 */
export const createMetaAdmin = async (
  baseUrl: string,
  email: string,
): Promise<{ client: TestClient; userId: string }> => {
  const pool = createPool(DATABASE_URL);

  try {
    const { rows: [tenant] } = await pool.query(
      `INSERT INTO tenants (slug, mode, status) VALUES ('meta', 'hosted', 'active')
       ON CONFLICT (slug) DO UPDATE SET slug = 'meta' RETURNING id`,
    );
    const tenantId = (tenant as { id: string }).id;

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ($1, 'active') RETURNING id`,
      [email],
    );
    const userId = (user as { id: string }).id;

    await pool.query(
      `INSERT INTO memberships (tenant_id, user_id, role) VALUES ($1, $2, 'meta_admin')
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = 'meta_admin'`,
      [tenantId, userId],
    );

    const jwt = await signJwt(userId, email);
    const client = new TestClient(baseUrl);
    client.setCookie('ual_session', jwt);

    return { client, userId };
  } finally {
    await pool.end();
  }
};
