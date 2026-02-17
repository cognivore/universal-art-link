import { z } from 'zod';

export const TenantStatus = z.enum(['pending', 'active', 'suspended']);
export type TenantStatus = z.infer<typeof TenantStatus>;

export const TenantMode = z.enum(['hosted', 'self_host']);
export type TenantMode = z.infer<typeof TenantMode>;

export const Tenant = z.object({
  id: z.string().uuid(),
  status: TenantStatus,
  slug: z.string().min(1).max(63),
  primaryDomain: z.string().nullable(),
  mode: TenantMode,
  createdAt: z.coerce.date(),
});

export type Tenant = z.infer<typeof Tenant>;

export const CreateTenantInput = z.object({
  slug: z.string().min(1).max(63).regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Slug must be lowercase alphanumeric with hyphens, not starting or ending with a hyphen',
  ),
  mode: TenantMode,
  primaryDomain: z.string().optional(),
});

export type CreateTenantInput = z.infer<typeof CreateTenantInput>;
