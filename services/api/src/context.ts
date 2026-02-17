import type { FastifyRequest } from 'fastify';
import type { Tenant, UserWithMemberships } from '@ual/core';

/**
 * Per-request context attached by middleware.
 * tenant is resolved from hostname; user is resolved from session cookie.
 */
export type RequestContext = {
  tenant: Tenant | null;
  user: UserWithMemberships | null;
};

declare module 'fastify' {
  interface FastifyRequest {
    ctx: RequestContext;
  }
}

export const emptyContext = (): RequestContext => ({
  tenant: null,
  user: null,
});
