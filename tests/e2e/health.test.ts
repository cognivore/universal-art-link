import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer } from './setup.js';
import { TestClient } from './client.js';

let baseUrl: string;
let client: TestClient;

beforeAll(async () => {
  baseUrl = await startServer();
  client = new TestClient(baseUrl);
});

afterAll(async () => {
  await stopServer();
});

describe('Health endpoints', () => {
  it('GET /healthz returns ok', async () => {
    const res = await client.get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /readyz returns ready when DB is connected', async () => {
    const res = await client.get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });
});
