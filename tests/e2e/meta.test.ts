import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer, getPool } from './setup.js';
import { createMetaAdmin } from './helpers.js';
import { TestClient } from './client.js';

let baseUrl: string;

beforeAll(async () => {
  baseUrl = await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe('Meta-admin API', () => {
  it('rejects unauthenticated requests', async () => {
    const client = new TestClient(baseUrl);
    const res = await client.get('/api/meta/tenants');
    expect(res.status).toBe(401);
  });

  it('lists tenants (meta_admin role)', async () => {
    const { client } = await createMetaAdmin(baseUrl, 'meta1@test.com');
    const res = await client.get<unknown[]>('/api/meta/tenants');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('lists pending registrations', async () => {
    const pool = getPool();
    await pool.query(
      `INSERT INTO users (email, status) VALUES ('pending1@test.com', 'pending')
       ON CONFLICT (email) DO NOTHING`,
    );

    const { client } = await createMetaAdmin(baseUrl, 'meta2@test.com');
    const res = await client.get<Array<{ email: string }>>('/api/meta/registrations');
    expect(res.status).toBe(200);
    expect(res.body.some((u) => u.email === 'pending1@test.com')).toBe(true);
  });

  it('approves a registration and creates tenant', async () => {
    const pool = getPool();
    const { rows: [pendingUser] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ('approve-me@test.com', 'pending') RETURNING id`,
    );
    const pendingId = (pendingUser as { id: string }).id;

    const { client } = await createMetaAdmin(baseUrl, 'meta3@test.com');
    const res = await client.post<{ tenantId: string; slug: string }>(
      `/api/meta/registrations/${pendingId}/approve`,
      { slug: 'approved-tenant' },
    );
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('approved-tenant');
    expect(res.body.tenantId).toBeTruthy();

    const userCheck = await pool.query('SELECT status FROM users WHERE id = $1', [pendingId]);
    expect((userCheck.rows[0] as { status: string }).status).toBe('active');
  });

  it('rejects a registration', async () => {
    const pool = getPool();
    const { rows: [pendingUser] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ('reject-me@test.com', 'pending') RETURNING id`,
    );
    const pendingId = (pendingUser as { id: string }).id;

    const { client } = await createMetaAdmin(baseUrl, 'meta4@test.com');
    const res = await client.post(`/api/meta/registrations/${pendingId}/reject`);
    expect(res.status).toBe(200);

    const userCheck = await pool.query('SELECT status FROM users WHERE id = $1', [pendingId]);
    expect((userCheck.rows[0] as { status: string }).status).toBe('disabled');
  });

  it('rejects invalid slug on approval', async () => {
    const pool = getPool();
    const { rows: [pendingUser] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ('bad-slug@test.com', 'pending') RETURNING id`,
    );
    const pendingId = (pendingUser as { id: string }).id;

    const { client } = await createMetaAdmin(baseUrl, 'meta5@test.com');

    const res1 = await client.post(
      `/api/meta/registrations/${pendingId}/approve`,
      { slug: 'admin' },
    );
    expect(res1.status).toBe(400);

    const res2 = await client.post(
      `/api/meta/registrations/${pendingId}/approve`,
      { slug: '-bad-slug-' },
    );
    expect(res2.status).toBe(400);
  });
});
