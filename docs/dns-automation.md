# DNS & Caddy Automation

## Provider research

- **Cloudflare** – instant API, low TTL (60s) allowed, wildcard SSL automation via ACME. Requires `zone_id` + API token with `Zone.DNS` perms.
- **Porkbun** – REST API with key/secret, TTL floor 600s (slower propagation) but inexpensive domains.
- **Gandi LiveDNS** – simple JSON API, TTL floor 300s, no wildcard auto-cert.

We target Cloudflare for first iteration thanks to sub-minute TTL + mature API. Interface lives in `src/lib/dnsProvisioner.ts` and can be swapped for additional providers by implementing `DnsProvider`.

```1:26:src/lib/dnsProvisioner.ts
export class CloudflareProvider implements DnsProvider {
  private readonly apiBase = 'https://api.cloudflare.com/client/v4';

  constructor(private readonly token: string, private readonly zoneId: string) {}

  async createRecord(request: DnsRecordRequest): Promise<void> {
    const response = await fetch(`${this.apiBase}/zones/${this.zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ type: request.type, name: request.name, content: request.content, ttl: request.ttl ?? 60, proxied: false }),
    });
```

## Caddy integration

- Caddy admin API exposed at `UAL_CADDY_ADMIN_URL` (default `http://127.0.0.1:2019`).
- `src/lib/caddyConfigurator.ts` pushes reverse proxy routes and triggers `/load` to request certificates.
- TLS: Caddy auto-requests certificates once DNS resolves to the host. We reload after DNS propagation so issuance succeeds immediately.

## Worker flow

`server/provision-worker.ts` glues everything together:

1. Read pending tenants from Strapi (`StrapiTenantStore.listTenants()`).
2. Call `DnsProvisioner.provision()` to create `CNAME subdomain.platformRoot -> platformRoot`.
3. Call `CaddyAdminClient.ensureReverseProxy()` and `reload()` to attach upstream.
4. Update Strapi tenant status to `active`.

### Required env vars

```
UAL_STRAPI_URL=https://cms.example.com
UAL_STRAPI_TOKEN=***
UAL_CLOUDFLARE_ZONE=zone-id
UAL_CLOUDFLARE_TOKEN=cf-token
UAL_PLATFORM_ROOT=ual.run
UAL_SITE_UPSTREAM=http://127.0.0.1:4173
UAL_CADDY_ADMIN_URL=http://127.0.0.1:2019
```

Run the worker with `tsx server/provision-worker.ts` or keep it on a schedule (e.g., systemd timer/cron).

## Next steps

- Add TXT verification + optional apex A-record support.
- Support Porkbun by implementing a `PorkbunProvider`.
- Stream Caddy logs back into Strapi webhooks for operator visibility.

