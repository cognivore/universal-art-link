# Rollout & Testing Checklist

## Local prerequisites

1. Install workspace deps: `nix develop . --command pnpm install`.
2. Build shadcn admin bundle once: `pnpm --filter ual-admin build`.
3. Export env vars:
   - `UAL_STRAPI_URL`, `UAL_STRAPI_TOKEN`
   - `UAL_CLOUDFLARE_ZONE`, `UAL_CLOUDFLARE_TOKEN`, `UAL_PLATFORM_ROOT`
   - `UAL_SITE_UPSTREAM`, `UAL_CADDY_ADMIN_URL`

## Admin dev smoke test

1. Run `pnpm dev -p 3322`.
2. Visit `http://localhost:3322/admin`.
3. Verify:
   - Preview iframe points to the dev server and shows health badge.
   - Connection form hits `/__ual/api/*` (use browser network tab).
   - Strapi card links to `${UAL_STRAPI_URL}/admin`.

## Strapi onboarding test

1. POST to `${UAL_STRAPI_URL}/api/tenants` with payload:
   ```json
   { "data": { "name": "Demo", "googleEmail": "demo@example.com", "subdomain": "demo" } }
   ```
2. Run `tsx server/provision-worker.ts`.
3. Inspect Strapi tenant status (should flip to `active`); confirm DNS + Caddy route exist.

## Packaging/deploy

1. `pnpm build` ensures admin bundle included (`dist/admin/index.html` from shadcn app).
2. `pnpm admin:build && pnpm package` to create ZIP containing both site + admin.

## Regression tests

- `pnpm lint` (CLI) + `pnpm --filter ual-admin lint`.
- Manual verification of `/__ual/healthz` and `/__ual/runtime` endpoints.
- DNS worker dry run against `MockDnsProvider` (set `UAL_SKIP_DNS=1` and swap provider when testing).

