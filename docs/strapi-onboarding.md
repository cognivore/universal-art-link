# Strapi Onboarding & Google SSO

## Content architecture

- **Collection type: `tenant`**
  - Fields: `name`, `slug`, `googleEmail`, `status (enum: draft → pending_dns → active)`, `subdomain`, `customDomain`, `plan`, `caddyConfig`.
  - Lifecycle hook (`afterCreate`) generates a random admin invite token + triggers DNS provisioning queue.
- **Collection type: `domain_request`**
  - Captures requested custom domains + DNS verification TXT.
  - Relates many-to-one with `tenant`.
- **Single type: `platform_settings`**
  - Stores DNS provider credentials (Cloudflare API token, Porkbun key/secret) and default TTL.
  - Offers toggles for `requireGoogleWorkspace`, `autoEnableCaddy`.

## Google OAuth

- Enable the `users-permissions` Google provider, set callback to `${STRAPI_URL}/api/auth/google/callback`.
- Restrict domain to `*@${platform_settings.googleWorkspaceDomain}` using Strapi's `beforeConnect` guard.
- Non-admin editors authenticate at `/admin` and Strapi role gates access to tenant entries via RBAC policies.

## Tenant lifecycle

1. UAL CLI posts to Strapi `/api/tenants` with `name`, `subdomain`, `googleEmail`.
2. Strapi hook enqueues DNS automation and responds with generated `tenant.id`.
3. DNS worker provisions `${subdomain}.${platformRoot}` + optional custom domain, updates `tenant.status` via `/api/tenants/:id`.
4. Once TLS + Caddy ready, Strapi sends webhook → CLI rebuild/publishes site.

Example CLI integration:

```1:22:src/lib/strapiTenantStore.ts
export class StrapiTenantStore {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly logger: Logger) {
    this.apiBase = `${baseUrl.replace(/\/$/, '')}/api`;
  }

  async createTenant(input: CreateTenantInput): Promise<TenantRecord> {
    this.logger.info(`Creating Strapi tenant ${input.subdomain}`);
    const payload = await this.request<{ data: { id: number; attributes: Record<string, unknown> } }>('/tenants', 'POST', input);
    return {
      id: payload.data.id,
      name: String(payload.data.attributes.name ?? input.name),
      slug: String(payload.data.attributes.slug ?? input.subdomain),
      googleEmail: String(payload.data.attributes.googleEmail ?? input.googleEmail),
      status: (payload.data.attributes.status as TenantRecord['status']) ?? 'draft',
      subdomain: String(payload.data.attributes.subdomain ?? input.subdomain),
      customDomain: payload.data.attributes.customDomain ? String(payload.data.attributes.customDomain) : undefined,
    };
  }
```

## Runtime expectations

- `window.__UAL_RUNTIME__.strapiUrl` now surfaces inside the shadcn admin (see Strapi card) so operators can jump into `/admin` quickly.
- CLI reads `UAL_STRAPI_URL`/`UAL_STRAPI_TOKEN` to bootstrap `StrapiTenantStore`, ensuring tenant metadata exists before DNS automation (next milestone).

## Next steps

- Generate Strapi migration scripts (`./strapi/export`) for the collection types above.
- Wire Google SSO domain enforcement + seed initial platform admin via Strapi bootstrap.
- Emit webhook payloads `{ tenantId, subdomain, status }` so the DNS worker + Caddy reconciler can react without polling.

