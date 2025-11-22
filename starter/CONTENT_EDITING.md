# Content Editing Guide

Designers and editors can update the site without touching templates or TypeScript. Everything lives inside `content/` and `assets/`.

## 1. Global settings

File: `content/site.config.yaml`

- `siteTitle`, `siteDescription`: update meta + footer copy.
- `favicon`: path to an asset in `assets/`.
- `theme`: background/foreground colors, accent, typography stacks, spacing density.
- `navigation`: order + labels of top navigation links. Use slugs (e.g. `/work`) or absolute URLs.
- `socialLinks`: shown in footer/sidebars.
- `deploy`: endpoint + auth for `universal-art-link deploy`.

## 2. Pages

Located under `content/pages/*.yaml`. Each page file contains:

- `slug`: route (e.g. `/`, `/work`, `/project-name`).
- `title` + optional `description`.
- `layout`: `default`, `project`, `index-grid`, `journal`, or `blog`.
- `sections`: ordered blocks that drive the layout.

### Section types

| Type            | Purpose                                                                      |
|-----------------|------------------------------------------------------------------------------|
| `hero`          | Large typographic intro with optional image + CTAs.                          |
| `projects-grid` | Image-led grid of portfolio entries (`span: wide | tall | standard`).        |
| `single-project`| Case study blocks mixing text, imagery, quotes, embeds.                      |
| `text-columns`  | 2–3 column manifesto/about copy.                                             |
| `list-section`  | Lists for press, clients, journal entries.                                   |
| `blog-roll`     | Auto-generated journal entry list referencing `journalPosts`.                |
| `contact`       | Email CTA + optional form action.                                            |

### Adding a project card

1. Open `content/pages/work.yaml`.
2. Add an entry under the `projects` array inside the relevant `projects-grid`.
3. Use `slug: "/project-new"` for internal links **or** `url` for external sites.
4. Drop the cover image into `assets/` and reference it via `/assets/...`.

### Creating a new page

1. Copy an existing file in `content/pages/`.
2. Update `slug`, `title`, and sections.
3. Reference the new slug inside `navigation` in `site.config.yaml`.
4. Run `pnpm cli build` or `universal-art-link dev` to preview.

## 3. Assets

- Place imagery/video inside `assets/`.
- Reference files via paths like `/assets/hero-still.svg`.
- Optimize visuals before committing for fast builds.

## 4. Preview + publish

```bash
universal-art-link dev       # live preview with hot reload
universal-art-link build     # regenerate dist/
universal-art-link package   # create dist/site-YYYYMMDD-HHMM.zip
universal-art-link deploy    # POST bundle to configured endpoint
```

### One-click deploy panel

- **Local admin (`pnpm admin`)** – serves `http://localhost:4545/` with the Cargo-style UI. Connect once, then press **Deploy** to trigger `build → package → upload`.
- **Inline admin (`pnpm cli dev`)** – open `http://localhost:4173/admin/` while the dev server is running for the live-reload version.
- Both panels share the same connection file (`.ual/connection.json`) and never send data until you deploy.

### Schema-driven editor

- `content/schema.json` enumerates the fields, section blocks, and inline journal posts (`journalPosts` on any journal page) available to editors.
- Both admin experiences render that schema into forms so non-technical teammates can edit copy, navigation, and layout blocks, as well as reorder sections—plus a live preview pane mirrors the output when `pnpm cli dev` (on `http://localhost:4173`) is running.
- Unsupported/custom sections fall back to JSON textareas—extend `schema.json` to expose more structured controls.
- Journal posts can now be created inline with cover imagery, publish dates, and the same rich blocks used for case studies; the visible `blog-roll` simply references these posts so you only write once.

If CLI commands fail, read the error message—it points to the file/field that needs attention.
