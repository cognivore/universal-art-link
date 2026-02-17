import type { CaddyPort } from './ports.js';

/**
 * Caddy Admin API adapter.
 * Adds/removes per-tenant route configs via Caddy's JSON API.
 * Idempotent: safe to re-apply.
 */
export const createCaddyAdapter = (
  adminUrl: string,
  apiUpstream: string,
  realtimeUpstream: string,
): CaddyPort => {
  const caddyFetch = async (path: string, method: string, body?: unknown): Promise<void> => {
    const res = await fetch(`${adminUrl}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Caddy API ${method} ${path}: ${res.status} ${text}`);
    }
  };

  return {
    async addTenantRoute(hostname, tenantId) {
      const route = {
        '@id': `tenant-${tenantId}`,
        match: [{ host: [hostname] }],
        handle: [
          {
            handler: 'subroute',
            routes: [
              {
                match: [{ path: ['/admin/*'] }],
                handle: [{
                  handler: 'file_server',
                  root: '/srv/admin',
                }],
              },
              {
                match: [{ path: ['/api/*'] }],
                handle: [{
                  handler: 'reverse_proxy',
                  upstreams: [{ dial: apiUpstream.replace(/^https?:\/\//, '') }],
                }],
              },
              {
                match: [{ path: ['/ws/*'] }],
                handle: [{
                  handler: 'reverse_proxy',
                  upstreams: [{ dial: realtimeUpstream.replace(/^https?:\/\//, '') }],
                }],
              },
              {
                match: [{ path: ['/static/*'] }],
                handle: [{
                  handler: 'file_server',
                  root: '/srv/static',
                }],
              },
              {
                handle: [{
                  handler: 'file_server',
                  root: `/srv/releases/${tenantId}/current`,
                }],
              },
            ],
          },
        ],
        terminal: true,
      };

      await caddyFetch(
        '/config/apps/http/servers/srv0/routes',
        'POST',
        route,
      );
    },

    async removeTenantRoute(hostname) {
      await caddyFetch(
        `/id/tenant-${hostname}`,
        'DELETE',
      ).catch(() => undefined);
    },
  };
};
