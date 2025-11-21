# Shadcn Admin Refactor Mapping

## Surfaces & Candidate Components

- **Connection shell** (`admin/index.html`) wraps copy, `<form id="connect-form" class="card">…</form>`:
  - Map layout to shadcn `Card`, `CardHeader`, `CardContent`.
  - Replace `.field` inputs with `Label`, `Input`, `PasswordInput`.
  - `.connect-button` → `Button` (variant=`default`); `.ghost-button` → `Button` (variant=`outline`).
- **Status + log panels** share stacked boxes: convert to `Card` + `Badge` for status chips, `ScrollArea` for `[data-log]`.
- **Activity log entries** (rendered via `log-entry` divs) become `Alert` components with `variant` tied to `data-variant`.
- **Shared content studio** (rendered by `admin/shared/editor.js`):
  - Sidebar lists (`renderPagesPanel`) → `ScrollArea` + `Button` (variant=`ghost`) list items.
  - Section editors (`renderSection`) animate around `.ual-section` divs; swap to `Accordion`/`Tabs` + `FormField`.
  - Toolbar (`[data-action=\"toggle-preview\"]`, `[data-action=\"save\"]`) → `Button` group with `DropdownMenu` for devices.
  - Preview splitter uses `div class=\"ual-editor__surface\"`: rebuild via shadcn `ResizablePanelGroup` (Radix) + `Iframe` wrapper.

## Preview & iframe reliability

- Current preview target computed in

```612:647:admin/shared/editor.js
const renderPreviewPane = () => {
  if (!state.previewVisible) {
    return '';
  }
  const slug = normalizeSlug(getSelectedPage()?.data?.slug ?? '/');
  …
  <iframe class="${iframeClasses.join(' ')}" data-preview-frame title="Site preview"></iframe>
};
```

- Action items:
  - Move preview base into shared config (e.g., `config/ual.config.json`), update via CLI when `dev -p 3322`.
  - Wrap iframe in a component that pings `${base}/healthz` before loading; display `Alert` if unreachable.
  - Subscribe to `/__ual/live` SSE inside admin app (reuse logic from `editor.js` `EventSource`) for rebuild awareness.

## Shadcn Package Structure

- Scaffold `apps/admin` (Vite + React + TypeScript + `@shadcn/ui`).
- Shared primitives:
  - `components/ui/app-shell.tsx` → `Sidebar`, `TopNav`, `iframe`.
  - `components/forms/FieldRenderer.tsx` implements schema-driven fields mirroring `renderField`.
  - `components/editor/PreviewPane.tsx` handles iframe + device buttons.
- Import styles via shadcn CSS tokens; drop bespoke `.css` except typography overrides.

## Data/Command Touchpoints

- CLI must expose admin assets under `/__admin/*`. Extend dev server to proxy Strapi + Vite dev using config derived from `src/lib/devServer.ts`.
- New config shape:

```1:6:src/lib/devServer.ts
export type AdminRuntimeConfig = {
  previewBaseUrl: string;
  adminBaseUrl: string;
  strapiUrl: string;
};
```

- `universal-art-link dev -p 3322` should register app + admin preview URLs in this config so the iframe always resolves, independent of custom ports.

