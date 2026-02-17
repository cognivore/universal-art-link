import type { FastifyInstance } from 'fastify';
import type { UserRepo, MagicLinkRepo } from '@ual/storage';
import { generateMagicToken, hashToken, signJwt } from '../auth.js';
import { sendMagicLink } from '../email.js';
import { config } from '../config.js';

const SESSION_COOKIE = 'ual_session';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env['NODE_ENV'] !== 'test',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: config.jwtExpirySeconds,
};

export const registerAuthRoutes = (
  app: FastifyInstance,
  userRepo: UserRepo,
  magicLinkRepo: MagicLinkRepo,
) => {
  app.post('/api/auth/register', async (request, reply) => {
    if (config.mode !== 'hosted') {
      return reply.status(404).send({ error: 'Registration not available in self-host mode' });
    }

    const { email } = request.body as { email: string };
    if (!email) return reply.status(400).send({ error: 'Email required' });

    const existing = await userRepo.findByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'User already exists' });
    }

    const user = await userRepo.create(email, 'pending');
    return reply.status(201).send({ id: user.id, status: user.status });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const { email } = request.body as { email: string };
    if (!email) return reply.status(400).send({ error: 'Email required' });

    const user = await userRepo.findByEmail(email);
    if (!user || user.status !== 'active') {
      return reply.send({ ok: true });
    }

    const { token, hash } = generateMagicToken();
    const expiresAt = new Date(Date.now() + config.magicLinkExpiryMinutes * 60_000);
    await magicLinkRepo.create(user.id, hash, expiresAt);

    const proto = request.headers['x-forwarded-proto'] ?? (process.env['NODE_ENV'] === 'production' ? 'https' : 'http');
    const verifyUrl = `${proto}://${request.hostname}/api/auth/verify?token=${token}`;
    await sendMagicLink(email, verifyUrl);

    return reply.send({ ok: true });
  });

  app.get('/api/auth/verify', async (request, reply) => {
    const { token } = request.query as { token?: string };
    if (!token) return reply.status(400).send({ error: 'Token required' });

    const hash = hashToken(token);
    const record = await magicLinkRepo.findByHash(hash);

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return reply.status(400).send({ error: 'Invalid or expired token' });
    }

    await magicLinkRepo.markUsed(record.id);

    const user = await userRepo.findById(record.userId);
    if (!user || user.status !== 'active') {
      return reply.status(400).send({ error: 'Account not active' });
    }

    const jwt = await signJwt(user.id, user.email);
    reply.setCookie(SESSION_COOKIE, jwt, COOKIE_OPTS);
    return reply.redirect('/admin');
  });

  app.get('/api/auth/me', async (request, reply) => {
    if (!request.ctx.user) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }
    const { id, email, status, memberships } = request.ctx.user;
    return reply.send({ id, email, status, memberships });
  });

  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });
};
