import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer, getPool } from './setup.js';
import { TestClient } from './client.js';
import { signJwt } from '../../services/api/src/auth.js';

let baseUrl: string;

beforeAll(async () => {
  baseUrl = await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe('Auth flow', () => {
  it('GET /api/auth/me returns 401 without session', async () => {
    const client = new TestClient(baseUrl);
    const res = await client.get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/login sends magic link (returns ok even for unknown user)', async () => {
    const client = new TestClient(baseUrl);
    const res = await client.post('/api/auth/login', { email: 'nobody@test.com' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /api/auth/login returns 400 without email', async () => {
    const client = new TestClient(baseUrl);
    const res = await client.post('/api/auth/login', {});
    expect(res.status).toBe(400);
  });

  it('GET /api/auth/me returns user data with valid JWT cookie', async () => {
    const pool = getPool();

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ('authtest@test.com', 'active') RETURNING id`,
    );
    const userId = (user as { id: string }).id;

    const jwt = await signJwt(userId, 'authtest@test.com');

    const client = new TestClient(baseUrl);
    client.setCookie('ual_session', jwt);

    const res = await client.get<{ id: string; email: string }>('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(userId);
    expect(res.body.email).toBe('authtest@test.com');
  });

  it('POST /api/auth/logout clears session', async () => {
    const pool = getPool();

    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, status) VALUES ('logouttest@test.com', 'active') RETURNING id`,
    );
    const userId = (user as { id: string }).id;
    const jwt = await signJwt(userId, 'logouttest@test.com');

    const client = new TestClient(baseUrl);
    client.setCookie('ual_session', jwt);

    const logoutRes = await client.post('/api/auth/logout');
    expect(logoutRes.status).toBe(200);
  });

  it('POST /api/auth/register creates pending user in hosted mode', async () => {
    const client = new TestClient(baseUrl);
    const res = await client.post<{ id: string; status: string }>(
      '/api/auth/register',
      { email: 'newuser@test.com' },
    );
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.id).toBeTruthy();
  });

  it('POST /api/auth/register rejects duplicate email', async () => {
    const client = new TestClient(baseUrl);
    const res = await client.post('/api/auth/register', { email: 'newuser@test.com' });
    expect(res.status).toBe(409);
  });
});
