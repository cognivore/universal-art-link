import type { FastifyInstance } from 'fastify';
import type { TenantRepo } from '@ual/storage';
import type { Tenant } from '@ual/core';
import { config } from '../config.js';

/**
 * Resolve tenant from request hostname.
 * For hosted mode: extracts slug from subdomain of baseDomain.
 * For self-host mode: looks up the domain directly.
 * Sets request.ctx.tenant.
 */
export const registerTenantResolver = (
  app: FastifyInstance,
  tenantRepo: TenantRepo,
) => {
  app.addHook('onRequest', async (request) => {
    const hostname = request.hostname.split(':')[0]!;

    let tenant: Tenant | null = null;

    if (config.mode === 'hosted') {
      const suffix = '.' + config.baseDomain;
      if (hostname.endsWith(suffix)) {
        const slug = hostname.slice(0, -suffix.length);
        if (slug && !slug.includes('.')) {
          tenant = await tenantRepo.findBySlug(slug);
        }
      }
    }

    if (!tenant) {
      tenant = await tenantRepo.findByDomain(hostname);
    }

    request.ctx.tenant = tenant;
  });
};
