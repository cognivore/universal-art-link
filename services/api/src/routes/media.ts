import type { FastifyInstance } from 'fastify';
import type { MediaRepo, ObjectStoragePort } from '@ual/storage';
import { requireAuth, requireTenant, requireRole } from '../middleware/guards.js';
import { newId } from '@ual/core';

export const registerMediaRoutes = (
  app: FastifyInstance,
  mediaRepo: MediaRepo,
  storage: ObjectStoragePort,
) => {
  app.post('/api/media/upload', {
    preHandler: [requireAuth, requireTenant, requireRole('owner', 'editor')],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const buffer = await data.toBuffer();
    const ext = data.filename.split('.').pop() ?? 'bin';
    const key = `${tenantId}/${newId()}.${ext}`;

    await storage.put(key, new Uint8Array(buffer), data.mimetype);

    const asset = await mediaRepo.create(
      tenantId, key, data.mimetype,
    );

    return reply.status(201).send({
      id: asset.id,
      url: storage.url(key),
      mime: asset.mime,
    });
  });

  app.get('/api/media/list', {
    preHandler: [requireAuth, requireTenant],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const assets = await mediaRepo.listByTenant(tenantId);
    return reply.send(
      assets.map((a) => ({
        ...a,
        url: storage.url(a.storageKey),
      })),
    );
  });

  app.get('/api/media/:id', {
    preHandler: [requireAuth, requireTenant],
  }, async (request, reply) => {
    const tenantId = request.ctx.tenant!.id;
    const { id } = request.params as { id: string };

    const asset = await mediaRepo.findById(id, tenantId);
    if (!asset) return reply.status(404).send({ error: 'Asset not found' });

    return reply.send({
      ...asset,
      url: storage.url(asset.storageKey),
    });
  });
};
