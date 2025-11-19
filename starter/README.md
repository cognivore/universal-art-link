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
- `universal-art-link deploy` – POST the generated zip using credentials in `content/site.config.*` or the admin connection.
- `universal-art-link endpoint` – run the remote HTTP endpoint that accepts connections + bundles (secured by a shared secret).

## Artist-friendly admin panel

1. Run `universal-art-link dev` (or `pnpm cli dev`) and visit `http://localhost:4173/admin/`.
2. Enter your host URL + shared secret. We keep them inside `.ual/connection.json`.
3. Press **Connect** to verify the remote server.
4. Use the huge **Deploy to …** button whenever you want to publish changes. No terminal required.

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

1. Use the admin panel button for the simplest flow (build + upload in one click).
2. Or configure `deploy.endpoint` (and optional `authHeader`) in `content/site.config.yaml` and run `universal-art-link deploy`.
3. The CLI rebuilds, zips, and POSTs the archive to the configured endpoint (or the saved connection).

For editors, see [`CONTENT_EDITING.md`](./CONTENT_EDITING.md).

