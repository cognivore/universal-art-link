# universal-art-link

Local-first Cargo-style static site constructor with a high-fashion editorial design system.

## Tooling

- **Nix + direnv** provide a reproducible shell (`direnv allow`).
- **pnpm + TypeScript** for the CLI and build pipeline.
- **Handlebars** templates with strongly typed content schemas (Zod).

## Quick start

```bash
direnv allow                # loads pnpm/node from flake
pnpm install
pnpm build                  # compiles the CLI to ./build
pnpm cli dev                # run dev server with hot reload
```

Install the CLI globally from this repo:

```bash
pnpm link --global
universal-art-link --help
```

## CLI commands

- `universal-art-link init` – copy starter `content/`, `templates/`, `assets/`, and docs into the current directory. Use `--force` to overwrite.
- `universal-art-link dev` – rebuild on changes, serve `dist/`, push live reload.
- `universal-art-link build` – render Handlebars layouts with structured content into `dist/`.
- `universal-art-link package` – zip `dist/` into `dist/site-YYYYMMDD-HHMM.zip`.
- `universal-art-link deploy` – POST the generated zip using credentials in `content/site.config.*` **or** the saved admin connection.
- `universal-art-link endpoint` – run a remote HTTP endpoint that receives connections + zip uploads secured by a shared secret.

## Artist-friendly admin panel

### Local admin server (Cargo-style)

1. Run `pnpm admin` (served from `admin/server.js`) to boot the panel at `http://localhost:4545/`.
2. Paste the deploy endpoint + shared secret once. We verify `/connect` and store everything inside `.ual/connection.json`.
3. Click **Deploy** whenever you are ready. The panel shells out to `node build/cli.js build` → `package` and streams the latest zip to your remote host.
4. Optional: run `pnpm cli dev` in another terminal so the right-side preview pane can render the live site (it targets `http://localhost:4173`); otherwise hide the preview with the toggle.

### Dev server panel (live reload)

Prefer the inline overlay? Run `universal-art-link dev` (or `pnpm cli dev`) and open `http://localhost:4173/admin/`. It uses the same connection store, so you can switch between panels freely.

### Schema-driven editor

- Define fields + section blocks in `content/schema.json`.
- Both admin experiences load that schema over `/api/content`, render site/page forms, and let editors add/reorder sections visually while a live preview stays in sync.
- Unsupported/custom sections fall back to JSON textareas, so you always have an escape hatch.

## Project structure

```
content/            # YAML/JSON site config + page definitions
templates/          # Layouts, sections, CSS, JS
assets/             # Imagery, favicon, media
src/                # Type-safe CLI + build pipeline
dist/               # Generated static site (after build)
```

## Development checklist

- `pnpm lint` – type-check the CLI with `tsc --noEmit`.
- `pnpm test:templates` – validate Handlebars template syntax (see [TEMPLATE_PROTECTION.md](./TEMPLATE_PROTECTION.md)).
- `pnpm dev` – run CLI via tsx (aliased to `pnpm cli dev`).
- Treat warnings as errors; type coverage is enforced via strict TypeScript options.

### Template protection

Handlebars templates are protected from auto-formatters that break `{{variable}}` syntax:

- ✅ `.prettierignore` excludes all `.hbs` files
- ✅ Warning comments in each template file
- ✅ Automated validation tests (`pnpm test:templates`)
- ✅ Git pre-commit hook blocks malformed templates

See [TEMPLATE_PROTECTION.md](./TEMPLATE_PROTECTION.md) for details.

## Deployment

### Option A – magic button

Use either admin UI (local server or dev panel). Connect once, then deploy with a single click.

### Option B – classic config

1. Configure `deploy.endpoint` (and optional `authHeader`) in `content/site.config.yaml`.
2. Run `universal-art-link deploy`.
3. The CLI rebuilds, zips, and POSTs the archive to the configured endpoint (or falls back to the saved admin connection if no config exists).

### Remote endpoint

Need a deploy receiver with release folders + atomic symlinks? Run `server/deploy-receiver.js`:

```bash
ssh user@server
git clone <this-repo> deploy-endpoint
cd deploy-endpoint
pnpm install
DEPLOY_SECRET="long-random-secret" \
DEPLOY_BASE="/var/www/mysite" \
PORT=8080 \
node server/deploy-receiver.js
```

Routes:

- `POST /connect` – validates the shared secret.
- `POST /deploy` – streams `application/zip`, extracts into `/releases/<timestamp>` via `adm-zip`, flips `/current`, and prunes older releases (keeps 5). No system `unzip` required.

Point Nginx/Apache at `/current` for uninterrupted rollouts.

For editors, see [`CONTENT_EDITING.md`](./CONTENT_EDITING.md).

