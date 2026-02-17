import { z } from 'zod';

export const Snapshot = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  docVersion: z.number().int(),
  label: z.string().nullable(),
  createdBy: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
  yjsState: z.instanceof(Uint8Array),
  siteJson: z.unknown().nullable(),
});

export type Snapshot = z.infer<typeof Snapshot>;

export const PublishedRevision = z.object({
  tenantId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  publishedAt: z.coerce.date(),
  publishedBy: z.string().uuid().nullable(),
});

export type PublishedRevision = z.infer<typeof PublishedRevision>;

export const PublishJobStatus = z.enum(['queued', 'running', 'success', 'failed']);
export type PublishJobStatus = z.infer<typeof PublishJobStatus>;

export const PublishJob = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  snapshotId: z.string().uuid(),
  status: PublishJobStatus,
  log: z.unknown().nullable(),
  createdAt: z.coerce.date(),
  startedAt: z.coerce.date().nullable(),
  finishedAt: z.coerce.date().nullable(),
});

export type PublishJob = z.infer<typeof PublishJob>;
