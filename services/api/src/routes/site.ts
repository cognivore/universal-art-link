import type { FastifyInstance } from 'fastify';
import type { SnapshotRepo, DraftRepo } from '@ual/storage';
import { requireAuth, requireTenant, requireRole } from '../middleware/guards.js';
import type PgBoss from 'pg-boss';

export const registerSiteRoutes = (
  app: FastifyInstance,
  snapshotRepo: SnapshotRepo,
  draftRepo: DraftRepo,
  boss: PgBoss,
) => {
  app.get('/api/site/snapshots', {
    preHandler: [requireAuth, requireTenant],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const snapshots = await snapshotRepo.listByTenant(tenantId);
    return reply.send(
      snapshots.map(({ yjsState: _, ...rest }) => rest),
    );
  });

  app.post('/api/site/snapshots', {
    preHandler: [requireAuth, requireTenant, requireRole('owner', 'editor')],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const userId = request.ctx.user!.id;
    const { label } = (request.body ?? {}) as { label?: string };

    const draft = await draftRepo.getDraft(tenantId);
    if (!draft) {
      return reply.status(404).send({ error: 'No draft found' });
    }

    const updates = await draftRepo.getUpdates(tenantId, draft.docVersion);
    if (updates.length === 0) {
      return reply.status(400).send({ error: 'Draft has no content' });
    }

    const { encodeStateAsUpdate, applyUpdate, Doc } = await import('yjs');
    const doc = new Doc();
    for (const u of updates) {
      applyUpdate(doc, u.updateData);
    }

    const yjsState = encodeStateAsUpdate(doc);
    const snapshot = await snapshotRepo.create(
      tenantId, draft.docVersion, yjsState, null, label, userId,
    );

    return reply.status(201).send({ id: snapshot.id, createdAt: snapshot.createdAt });
  });

  app.post('/api/site/rollback', {
    preHandler: [requireAuth, requireTenant, requireRole('owner', 'editor')],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const { snapshotId } = request.body as { snapshotId: string };

    const snapshot = await snapshotRepo.findById(snapshotId, tenantId);
    if (!snapshot) {
      return reply.status(404).send({ error: 'Snapshot not found' });
    }

    const newVersion = await draftRepo.incrementVersion(tenantId);
    await draftRepo.appendUpdate(tenantId, newVersion, snapshot.yjsState);

    return reply.send({ docVersion: newVersion });
  });

  app.post('/api/site/publish', {
    preHandler: [requireAuth, requireTenant, requireRole('owner', 'editor')],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const userId = request.ctx.user!.id;

    const draft = await draftRepo.getDraft(tenantId);
    if (!draft) {
      return reply.status(404).send({ error: 'No draft found' });
    }

    const updates = await draftRepo.getUpdates(tenantId, draft.docVersion);
    const { encodeStateAsUpdate, applyUpdate, Doc } = await import('yjs');
    const doc = new Doc();
    for (const u of updates) {
      applyUpdate(doc, u.updateData);
    }

    const yjsState = encodeStateAsUpdate(doc);
    const snapshot = await snapshotRepo.create(
      tenantId, draft.docVersion, yjsState, null, 'auto-publish', userId,
    );

    const job = await snapshotRepo.createPublishJob(tenantId, snapshot.id);
    await boss.send('publish', { jobId: job.id, tenantId, snapshotId: snapshot.id });

    return reply.status(202).send({ jobId: job.id, snapshotId: snapshot.id });
  });

  app.get('/api/site/publish/status', {
    preHandler: [requireAuth, requireTenant],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const job = await snapshotRepo.getLatestPublishJob(tenantId);
    return reply.send(job ?? { status: 'none' });
  });

  app.post('/api/site/publish/rollback', {
    preHandler: [requireAuth, requireTenant, requireRole('owner')],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const { snapshotId } = request.body as { snapshotId: string };

    const snapshot = await snapshotRepo.findById(snapshotId, tenantId);
    if (!snapshot) {
      return reply.status(404).send({ error: 'Snapshot not found' });
    }

    const job = await snapshotRepo.createPublishJob(tenantId, snapshot.id);
    await boss.send('publish', { jobId: job.id, tenantId, snapshotId: snapshot.id });

    return reply.status(202).send({ jobId: job.id });
  });
};
