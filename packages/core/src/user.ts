import { z } from 'zod';

export const UserStatus = z.enum(['pending', 'active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatus>;

export const MembershipRole = z.enum(['owner', 'editor', 'viewer', 'meta_admin']);
export type MembershipRole = z.infer<typeof MembershipRole>;

export const User = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  status: UserStatus,
  createdAt: z.coerce.date(),
});

export type User = z.infer<typeof User>;

export const Membership = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  role: MembershipRole,
});

export type Membership = z.infer<typeof Membership>;

export const UserWithMemberships = User.extend({
  memberships: z.array(Membership),
});

export type UserWithMemberships = z.infer<typeof UserWithMemberships>;
