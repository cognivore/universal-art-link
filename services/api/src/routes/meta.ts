import type { FastifyInstance } from 'fastify';
import type { UserRepo, TenantRepo, DomainRepo, StripeConnectionRepo } from '@ual/storage';
import { requireAuth, requirePlatformRole } from '../middleware/guards.js';
import { validateSlug } from '@ual/core';
import type PgBoss from 'pg-boss';

export const registerMetaRoutes = (
  app: FastifyInstance,
  userRepo: UserRepo,
  tenantRepo: TenantRepo,
  boss: PgBoss,
  domainRepo: DomainRepo,
  stripeConnectionRepo: StripeConnectionRepo,
) => {
  const metaGuard = [requireAuth, requirePlatformRole('meta_admin')];

  // ── Registrations ─────────────────────────────────────────────

  app.get('/api/meta/registrations', {
    preHandler: metaGuard,
  }, async (_request, reply) => {
    const pending = await userRepo.listPending();
    return reply.send(pending);
  });

  app.post('/api/meta/registrations/:id/approve', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { slug } = request.body as { slug: string };

    const user = await userRepo.findById(id);
    if (!user) return reply.status(404).send({ error: 'User not found' });
    if (user.status !== 'pending') {
      return reply.status(400).send({ error: 'User is not pending' });
    }

    const slugResult = validateSlug(slug);
    if (!slugResult.valid) {
      return reply.status(400).send({ error: slugResult.reason });
    }

    const tenant = await tenantRepo.create({ slug: slugResult.slug, mode: 'hosted' });
    await userRepo.updateStatus(id, 'active');
    await userRepo.addMembership(tenant.id, id, 'owner');

    await boss.send('provision_tenant', { tenantId: tenant.id });

    return reply.send({ tenantId: tenant.id, slug: tenant.slug });
  });

  app.post('/api/meta/registrations/:id/reject', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await userRepo.updateStatus(id, 'disabled');
    return reply.send({ ok: true });
  });

  // ── Tenants ───────────────────────────────────────────────────

  app.get('/api/meta/tenants', {
    preHandler: metaGuard,
  }, async (_request, reply) => {
    const tenants = await tenantRepo.listAll();
    return reply.send(tenants);
  });

  app.get('/api/meta/tenants/:id', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const tenant = await tenantRepo.findById(id);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const domains = await domainRepo.listByTenant(id);
    const stripe = await stripeConnectionRepo.get(id);
    return reply.send({ ...tenant, domains, stripe: stripe ?? null });
  });

  /**
   * Create a new tenant directly (meta-admin only).
   * Creates the tenant, owner user (or links existing), domain record,
   * and optionally enqueues DNS + Caddy provisioning.
   */
  app.post('/api/meta/tenants', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const body = request.body as {
      slug: string;
      ownerEmail: string;
      domain?: string;
      mode?: 'hosted' | 'self_host';
      provision?: boolean;
    };

    if (!body.slug || !body.ownerEmail) {
      return reply.status(400).send({ error: 'slug and ownerEmail are required' });
    }

    const slugResult = validateSlug(body.slug);
    if (!slugResult.valid) {
      return reply.status(400).send({ error: slugResult.reason });
    }

    const existing = await tenantRepo.findBySlug(slugResult.slug);
    if (existing) {
      return reply.status(409).send({ error: `Tenant slug "${slugResult.slug}" already taken` });
    }

    const hostname = body.domain || null;
    const tenant = await tenantRepo.create({
      slug: slugResult.slug,
      mode: body.mode ?? 'self_host',
      primaryDomain: hostname ?? undefined,
    });

    let user = await userRepo.findByEmail(body.ownerEmail);
    if (!user) {
      user = await userRepo.create(body.ownerEmail, 'active');
    } else if (user.status !== 'active') {
      await userRepo.updateStatus(user.id, 'active');
    }
    await userRepo.addMembership(tenant.id, user.id, 'owner');

    let domain = null;
    if (hostname) {
      domain = await domainRepo.create(tenant.id, hostname);
    }

    if (body.provision !== false && hostname) {
      await boss.send('provision_tenant', {
        tenantId: tenant.id,
        hostname,
      });
    }

    return reply.status(201).send({
      tenant: { id: tenant.id, slug: tenant.slug, status: tenant.status },
      owner: { id: user.id, email: user.email },
      domain,
    });
  });

  // ── Domains ───────────────────────────────────────────────────

  app.get('/api/meta/tenants/:id/domains', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const domains = await domainRepo.listByTenant(id);
    return reply.send(domains);
  });

  app.post('/api/meta/tenants/:id/domains', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { hostname, provision } = request.body as {
      hostname: string;
      provision?: boolean;
    };

    if (!hostname) return reply.status(400).send({ error: 'hostname required' });

    const tenant = await tenantRepo.findById(id);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    const existingDomain = await domainRepo.findByHostname(hostname);
    if (existingDomain) {
      return reply.status(409).send({ error: `Domain "${hostname}" already registered` });
    }

    const domain = await domainRepo.create(id, hostname);

    if (provision !== false) {
      await boss.send('provision_tenant', { tenantId: id, hostname });
    }

    return reply.status(201).send(domain);
  });

  // ── Stripe per-tenant ─────────────────────────────────────────

  app.post('/api/meta/tenants/:id/stripe', {
    preHandler: metaGuard,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { mode, connectAccountId } = request.body as {
      mode: string;
      connectAccountId?: string;
    };

    const tenant = await tenantRepo.findById(id);
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' });

    await stripeConnectionRepo.upsert(
      id,
      mode as 'payment_links' | 'connect' | 'restricted_key',
      connectAccountId,
    );

    return reply.send({ ok: true });
  });
};
