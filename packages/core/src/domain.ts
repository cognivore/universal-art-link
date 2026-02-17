import { z } from 'zod';

export const DomainStatus = z.enum(['pending', 'active', 'error']);
export type DomainStatus = z.infer<typeof DomainStatus>;

export const Domain = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  hostname: z.string(),
  status: DomainStatus,
  provisioningLog: z.unknown().nullable(),
  createdAt: z.coerce.date(),
});

export type Domain = z.infer<typeof Domain>;

export const StripeMode = z.enum(['payment_links', 'connect', 'restricted_key']);
export type StripeMode = z.infer<typeof StripeMode>;

export const StripeConnection = z.object({
  tenantId: z.string().uuid(),
  mode: StripeMode,
  connectAccountId: z.string().nullable(),
  encryptedRestrictedKey: z.instanceof(Uint8Array).nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export type StripeConnection = z.infer<typeof StripeConnection>;
