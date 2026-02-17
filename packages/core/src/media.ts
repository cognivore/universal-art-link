import { z } from 'zod';

export const FocalPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});

export type FocalPoint = z.infer<typeof FocalPoint>;

export const MediaAsset = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  storageKey: z.string(),
  mime: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  alt: z.string().nullable(),
  caption: z.string().nullable(),
  credit: z.string().nullable(),
  focalPoint: FocalPoint.nullable(),
  createdAt: z.coerce.date(),
});

export type MediaAsset = z.infer<typeof MediaAsset>;

export const MediaModel = z.object({
  id: z.string(),
  storageKey: z.string(),
  mime: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  alt: z.string().nullable(),
  caption: z.string().nullable(),
  credit: z.string().nullable(),
  focalPoint: FocalPoint.nullable(),
});

export type MediaModel = z.infer<typeof MediaModel>;
