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

1. Run `universal-art-link dev` (or `pnpm cli dev`) and open `http://localhost:4173/admin/`.
2. Drop in the remote URL (for example `https://deploy.example.com`) and the shared secret your host generated.
3. Click **Connect**. We store the encrypted connection info locally inside `.ual/connection.json` and verify the remote via `/connect`.
4. Once connected the giant button reads **Deploy to &lt;url&gt;** — click it whenever you want to ship the latest build. The panel runs the full build → package → upload loop for you.

If the CLI is not running, the page explains how to start it. Disconnect at any time to wipe the stored secret.

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
- `pnpm dev` – run CLI via tsx (aliased to `pnpm cli dev`).
- Treat warnings as errors; type coverage is enforced via strict TypeScript options.

## Deployment

### Option A – magic button

The admin panel controls the CLI. Connect once, then press **Deploy to &lt;url&gt;** and wait for the confirmation toast.

### Option B – classic config

1. Configure `deploy.endpoint` (and optional `authHeader`) in `content/site.config.yaml`.
2. Run `universal-art-link deploy`.
3. The CLI rebuilds, zips, and POSTs the archive to the configured endpoint (or falls back to the saved admin connection if no config exists).

### Remote endpoint

Need a tiny server that accepts these uploads? Ship it with:

```bash
ssh user@server
git clone <this-repo> deploy-endpoint
cd deploy-endpoint
pnpm install && pnpm build
node build/cli.js endpoint --secret "SHARED_TOKEN" --target /var/www/yoursite --port 8080
```

The endpoint exposes two routes:

- `POST /connect` verifies the shared secret and responds with metadata for the admin panel.
- `POST /deploy` accepts `application/zip`, wipes the target folder, and extracts the new site.

For editors, see [`CONTENT_EDITING.md`](./CONTENT_EDITING.md).

