import type { FastifyRequest, FastifyReply } from 'fastify';
import type { MembershipRole } from '@ual/core';

/** Require an authenticated user. */
export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.ctx.user) {
    return reply.status(401).send({ error: 'Authentication required' });
  }
};

/** Require a resolved tenant. */
export const requireTenant = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.ctx.tenant) {
    return reply.status(404).send({ error: 'Tenant not found' });
  }
};

/** Require user to have a specific role on the current tenant. */
export const requireRole = (...roles: ReadonlyArray<MembershipRole>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { user, tenant } = request.ctx;
    if (!user || !tenant) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const membership = user.memberships.find(
      (m) => m.tenantId === tenant.id,
    );

    if (!membership || !roles.includes(membership.role)) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };

/**
 * Require a platform-level role (meta_admin).
 * Checks across ALL memberships, not just the current tenant.
 * This allows meta-admin operations on hostnames without tenant context.
 */
export const requirePlatformRole = (...roles: ReadonlyArray<MembershipRole>) =>
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { user } = request.ctx;
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }

    const hasRole = user.memberships.some((m) => roles.includes(m.role));
    if (!hasRole) {
      return reply.status(403).send({ error: 'Insufficient permissions' });
    }
  };
