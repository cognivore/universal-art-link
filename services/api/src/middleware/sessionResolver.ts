import type { FastifyInstance } from 'fastify';
import type { UserRepo } from '@ual/storage';
import { verifyJwt } from '../auth.js';

const SESSION_COOKIE = 'ual_session';

/**
 * Resolve user from session cookie JWT.
 * Sets request.ctx.user with memberships.
 */
export const registerSessionResolver = (
  app: FastifyInstance,
  userRepo: UserRepo,
) => {
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;

    const payload = await verifyJwt(token);
    if (!payload) return;

    const user = await userRepo.findWithMemberships(payload.sub);
    if (user && user.status === 'active') {
      request.ctx.user = user;
    }
  });
};
