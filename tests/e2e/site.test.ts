import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startServer, stopServer, getPool } from './setup.js';
import { createTestTenantWithOwner } from './helpers.js';
import { TestClient } from './client.js';
import * as Y from 'yjs';
import { getConfigMap, getPagesArray, pageToYMap } from '@ual/crdt';

let baseUrl: string;

beforeAll(async () => {
  baseUrl = await startServer();
});

afterAll(async () => {
  await stopServer();
});

describe('Site editing flow', () => {
  it('GET /api/site/snapshots returns empty list for new tenant', async () => {
    const { client } = await createTestTenantWithOwner(baseUrl, 'site-test-1', 'site1@test.com');
    const res = await client.get<unknown[]>('/api/site/snapshots');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('POST /api/site/snapshots fails when no CRDT updates exist', async () => {
    const { client } = await createTestTenantWithOwner(baseUrl, 'site-test-2', 'site2@test.com');
    const res = await client.post('/api/site/snapshots', { label: 'test' });
    expect(res.status).toBe(400);
  });

  it('full draft -> snapshot -> publish flow', async () => {
    const { client, tenantId } = await createTestTenantWithOwner(baseUrl, 'site-test-3', 'site3@test.com');

    const doc = new Y.Doc();
    doc.transact(() => {
      const configMap = getConfigMap(doc);
      configMap.set('title', 'Test Site');
      configMap.set('description', 'A test site');

      const pagesArr = getPagesArray(doc);
      const page = new Y.Map<unknown>();
      page.set('id', 'page-1');
      page.set('slug', '');
      page.set('title', 'Home');
      page.set('status', 'draft');
      page.set('seo', new Y.Map());
      page.set('blocks', new Y.Array());
      pagesArr.push([page]);
    });

    const update = Y.encodeStateAsUpdate(doc);

    const pool = getPool();
    await pool.query(
      `INSERT INTO crdt_updates (tenant_id, doc_version, update_data)
       VALUES ($1, 1, $2)`,
      [tenantId, Buffer.from(update)],
    );

    const snapRes = await client.post<{ id: string; createdAt: string }>(
      '/api/site/snapshots',
      { label: 'first snapshot' },
    );
    expect(snapRes.status).toBe(201);
    expect(snapRes.body.id).toBeTruthy();

    const listRes = await client.get<Array<{ id: string; label: string }>>('/api/site/snapshots');
    expect(listRes.status).toBe(200);
    expect(listRes.body.length).toBe(1);
    expect(listRes.body[0]!.label).toBe('first snapshot');

    const pubRes = await client.post<{ jobId: string; snapshotId: string }>('/api/site/publish');
    expect(pubRes.status).toBe(202);
    expect(pubRes.body.jobId).toBeTruthy();
    expect(pubRes.body.snapshotId).toBeTruthy();

    const statusRes = await client.get<{ status: string }>('/api/site/publish/status');
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBeTruthy();
  });

  it('snapshot rollback increments doc_version', async () => {
    const { client, tenantId } = await createTestTenantWithOwner(baseUrl, 'site-test-4', 'site4@test.com');

    const doc = new Y.Doc();
    doc.transact(() => {
      const configMap = getConfigMap(doc);
      configMap.set('title', 'Rollback Test');
    });
    const update = Y.encodeStateAsUpdate(doc);

    const pool = getPool();
    await pool.query(
      `INSERT INTO crdt_updates (tenant_id, doc_version, update_data) VALUES ($1, 1, $2)`,
      [tenantId, Buffer.from(update)],
    );

    const snapRes = await client.post<{ id: string }>('/api/site/snapshots', { label: 'before-rollback' });
    expect(snapRes.status).toBe(201);
    const snapshotId = snapRes.body.id;

    const rollbackRes = await client.post<{ docVersion: number }>('/api/site/rollback', { snapshotId });
    expect(rollbackRes.status).toBe(200);
    expect(rollbackRes.body.docVersion).toBe(2);
  });
});
