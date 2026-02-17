import type { PageModel, SiteConfig } from '@ual/core';
import { renderBlock } from './renderBlock.js';

export type RenderedPage = {
  readonly slug: string;
  readonly html: string;
};

/** Render a page to a full HTML document. Pure function. */
export const renderPage = (
  page: PageModel,
  config: SiteConfig,
  buildId: string,
): RenderedPage => {
  const blocksHtml = page.blocks.map(renderBlock).join('\n');

  const navHtml = config.navigation
    .map((n) => `<a href="/${n.slug}">${esc(n.label)}</a>`)
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(page.seo.title || page.title)} - ${esc(config.title)}</title>
  <meta name="description" content="${esc(page.seo.description || config.description)}" />
  ${page.seo.ogImage ? `<meta property="og:image" content="${esc(page.seo.ogImage)}" />` : ''}
  <link rel="stylesheet" href="/static/${buildId}/main.css" />
  <style>
    :root {
      --color-primary: ${config.palette.primary};
      --color-secondary: ${config.palette.secondary};
      --color-accent: ${config.palette.accent};
      --color-background: ${config.palette.background};
      --color-text: ${config.palette.text};
      --font-heading: ${config.typography.headingFont};
      --font-body: ${config.typography.bodyFont};
      --font-base-size: ${config.typography.baseSize}px;
    }
  </style>
</head>
<body>
  <nav class="site-nav">
    ${navHtml}
  </nav>
  <main>
    ${blocksHtml}
  </main>
  <script type="module" src="/static/${buildId}/main.js"></script>
</body>
</html>`;

  return { slug: page.slug, html };
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;');
