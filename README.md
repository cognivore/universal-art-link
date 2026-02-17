# UAL v2 -- Universal Artistic Link

Multi-tenant browser-only CMS with CRDT real-time editing, atomic publish, and Stripe integration.

## Architecture

- **Browser-only editing** -- no CLI, no Git. Everything via admin SPA.
- **CRDT autosave** (Yjs) with undo/redo, snapshots, and rollback.
- **Atomic publish** -- revision-pinned static HTML with symlink swap.
- **Two deployment modes**: hosted multi-tenant (with Porkbun DNS provisioning) or self-host single-owner.
- **Stripe integration** -- payment links (default), Connect (hosted), or restricted key (self-host).

## Monorepo Layout

```
apps/admin-web/        Vite React SPA (admin editor)
packages/core/         Types, schemas, pure domain functions
packages/ui/           Design tokens + layout primitives
packages/blocks/       Block components (shared editor + renderer)
packages/renderer/     SiteModel -> HTML pipeline
packages/crdt/         Yjs adapters (client + server)
packages/stripe/       Stripe ports + adapters
packages/provisioning/ Porkbun DNS + Caddy adapters
packages/storage/      Postgres + object storage adapters
services/api/          Fastify HTTP API
services/realtime/     WebSocket Yjs sync server
services/worker/       pg-boss job runner (publish, provision)
infra/docker/          Docker Compose, Caddyfile, env templates
infra/migrations/      Postgres SQL migrations
```

## Getting Started

### Prerequisites

- Node.js 22+, pnpm 10+ (provided by `nix develop`)
- PostgreSQL 16
- Caddy (for local routing, optional)

### Setup

```bash
# Enter Nix dev shell
nix develop

# Install dependencies
pnpm install

# Copy environment template
cp infra/docker/.env.template .env

# Start Postgres (via Docker or local)
docker compose -f infra/docker/docker-compose.yml up -d postgres

# Run migrations
pnpm db:migrate

# Build all packages
pnpm -r build

# Start services (in separate terminals)
pnpm --filter @ual/api dev
pnpm --filter @ual/realtime dev
pnpm --filter @ual/worker dev
pnpm --filter @ual/admin-web dev
```

Admin SPA runs on `http://localhost:4321` with API proxy to port 3000.

## Dependency Rules

- `@ual/core` is the only source of truth for schemas/types.
- `@ual/blocks` depends on `core` + `ui`.
- `@ual/admin-web` depends on `core` + `blocks` + `crdt`.
- `services/*` depend on `core` and adapter packages only.
- No circular dependencies.
