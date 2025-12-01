import { BlogPost, ProjectBlock, Section, SingleProjectSection } from '../types/content.js';

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const optional = (predicate: boolean, renderer: () => string): string => (predicate ? renderer() : '');

const renderMedia = (src: string, alt: string, className = 'ual-media'): string =>
  `<figure class="${className}">
    <img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy" />
  </figure>`;

type RenderOptions = {
  readonly resolveLink: (href: string) => string;
  readonly resolvePost?: (postId: string) => BlogPost | undefined;
};

const renderHero = (section: Section & { type: 'hero' }, options: RenderOptions): string => {
  const textColumn = `
    <div class="hero__copy stack">
      ${optional(Boolean(section.eyebrow), () => `<span class="eyebrow">${escapeHtml(section.eyebrow ?? '')}</span>`)}
      ${optional(Boolean(section.kicker), () => `<p class="kicker">${escapeHtml(section.kicker ?? '')}</p>`)}
      <h1 class="display">${escapeHtml(section.title)}</h1>
      ${optional(Boolean(section.subtitle), () => `<p class="measure">${escapeHtml(section.subtitle ?? '')}</p>`)}
      ${optional(Boolean(section.body), () => `<p class="measure muted">${escapeHtml(section.body ?? '')}</p>`)}
      <div class="hero__ctas">
        ${optional(Boolean(section.primaryCta), () => renderCta(section.primaryCta!, options))}
        ${optional(Boolean(section.secondaryCta), () => renderCta(section.secondaryCta!, options, 'ghost'))}
      </div>
    </div>`;

  const mediaColumn = section.media
    ? `<div class="hero__media">${renderMedia(section.media.src, section.media.alt, 'hero__figure')}</div>`
    : '';

  return `<section class="section hero grid-2">
    ${textColumn}
    ${mediaColumn}
  </section>`;
};

const renderCta = (
  cta: { label: string; href: string },
  options: RenderOptions,
  variant: 'solid' | 'ghost' = 'solid',
): string => {
  const href = options.resolveLink(cta.href);
  return `<a class="btn btn--${variant}" href="${escapeHtml(href)}">${escapeHtml(cta.label)}</a>`;
};

const renderProjectsGrid = (section: Section & { type: 'projects-grid' }, options: RenderOptions): string => {
  const cards = section.projects
    .map(
      (project) => {
        const href = project.url ?? project.slug ?? '#';
        const resolved = options.resolveLink(href);
        const external = /^https?:\/\//.test(href);
        return `<article class="project-card project-card--${project.span}">
        <a href="${escapeHtml(resolved)}" ${external ? 'target="_blank" rel="noreferrer"' : ''}>
          ${renderMedia(project.coverImage.src, project.coverImage.alt, 'project-card__media')}
          <div class="project-card__meta">
            <div>
              <p class="micro-label">${escapeHtml(project.role)} · ${escapeHtml(project.year)}</p>
              <h3>${escapeHtml(project.title)}</h3>
            </div>
            <span class="project-card__arrow">↗</span>
          </div>
        </a>
      </article>`;
      },
    )
    .join('\n');

  return `<section class="section projects-grid stack">
    <header class="section__header stack">
      <p class="kicker">${escapeHtml(section.title)}</p>
      ${optional(Boolean(section.intro), () => `<p class="measure">${escapeHtml(section.intro ?? '')}</p>`)}
    </header>
    <div class="projects-grid__items">
      ${cards}
    </div>
  </section>`;
};

const renderImageGridBlock = (block: Extract<ProjectBlock, { type: 'image-grid' }>): string => {
  const items = block.items
    .map((item) => {
      return `<figure class="image-grid__item">
        <img src="${escapeHtml(item.media.src)}" alt="${escapeHtml(item.media.alt ?? '')}" loading="lazy" />
        ${optional(Boolean(item.caption), () => `<figcaption class="image-grid__caption">${escapeHtml(item.caption ?? '')}</figcaption>`)}
      </figure>`;
    })
    .join('\n');

  return `<div class="project-block image-grid">
    ${items}
  </div>`;
};

const renderContentBlock = (block: ProjectBlock): string => {
  switch (block.type) {
    case 'text':
      return `<div class="project-block stack">
        ${optional(Boolean(block.title), () => `<h3>${escapeHtml(block.title ?? '')}</h3>`)}
        <p class="measure">${escapeHtml(block.body)}</p>
      </div>`;
    case 'image':
      return `<div class="project-block ${block.bleed ? 'project-block--bleed' : ''}">
        ${renderMedia(block.media.src, block.media.alt)}
        ${optional(Boolean(block.caption), () => `<figcaption class="micro-label">${escapeHtml(block.caption ?? '')}</figcaption>`)}
      </div>`;
    case 'image-grid':
      return renderImageGridBlock(block);
    case 'quote':
      return `<blockquote class="project-block quote">
        <p>“${escapeHtml(block.quote)}”</p>
        ${optional(Boolean(block.cite), () => `<footer>${escapeHtml(block.cite ?? '')}${optional(Boolean(block.role), () => ` — ${escapeHtml(block.role ?? '')}`)}</footer>`)}
      </blockquote>`;
    case 'embed':
      return `<div class="project-block embed">
        ${optional(Boolean(block.label), () => `<p class="micro-label">${escapeHtml(block.label ?? '')}</p>`)}
        ${block.html}
      </div>`;
    default:
      return '';
  }
};

const renderProjectBlocks = (blocks: readonly ProjectBlock[]): string => blocks.map((block) => renderContentBlock(block)).join('\n');

const renderSingleProject = (section: SingleProjectSection, _options: RenderOptions): string => {
  const header = `<header class="single-project__header stack">
    <p class="micro-label">${escapeHtml(section.role)} · ${escapeHtml(section.year)}</p>
    <h2 class="display">${escapeHtml(section.title)}</h2>
    ${optional(Boolean(section.tags?.length), () => `<ul class="pill-list">${section.tags!.map((tag) => `<li>${escapeHtml(tag)}</li>`).join('')}</ul>`)}
    ${optional(Boolean(section.credits?.length), () => `<p class="micro-label">Credits — ${section.credits!.map(escapeHtml).join(', ')}</p>`)}
  </header>`;

  const blocks = renderProjectBlocks(section.blocks);

  return `<section class="section single-project stack">
    ${header}
    <div class="project-blocks stack">
      ${blocks}
    </div>
  </section>`;
};

const renderTextColumns = (section: Section & { type: 'text-columns' }, _options: RenderOptions): string => {
  const columns = section.columns
    .map(
      (column) => `<div class="column stack">
        ${optional(Boolean(column.label), () => `<p class="micro-label">${escapeHtml(column.label ?? '')}</p>`)}
        <p class="measure">${escapeHtml(column.body)}</p>
      </div>`,
    )
    .join('\n');

  return `<section class="section text-columns stack">
    ${optional(Boolean(section.title), () => `<h2 class="display-sm">${escapeHtml(section.title ?? '')}</h2>`)}
    <div class="columns columns-3">
      ${columns}
    </div>
  </section>`;
};

const renderListSection = (section: Section & { type: 'list-section' }, options: RenderOptions): string => {
  const items = section.items
    .map((item) => {
      const label = escapeHtml(item.label);
      const detail = item.detail ? `<span class="muted">${escapeHtml(item.detail)}</span>` : '';
      const content = `<span>${label}</span>${detail}`;
      return item.url ? `<li><a href="${escapeHtml(options.resolveLink(item.url))}">${content}</a></li>` : `<li>${content}</li>`;
    })
    .join('\n');

  return `<section class="section list-section stack">
    <h3 class="kicker">${escapeHtml(section.title)}</h3>
    <ul class="list-section__items">
      ${items}
    </ul>
  </section>`;
};

const renderContact = (section: Section & { type: 'contact' }, options: RenderOptions): string => {
  const emailHref = `mailto:${section.email}`;
  return `<section class="section contact stack">
    <h2 class="display-sm">${escapeHtml(section.title)}</h2>
    <p class="measure">${escapeHtml(section.body)}</p>
    <a class="btn btn--solid" href="${escapeHtml(emailHref)}">${escapeHtml(section.email)}</a>
    ${optional(Boolean(section.formAction), () => `<form class="contact__form" action="${escapeHtml(options.resolveLink(section.formAction ?? ''))}" method="post" data-contact-form>
      <input type="hidden" name="pageUrl" value="" data-contact-page-url />
      <input type="hidden" name="pageTitle" value="" data-contact-page-title />
      <input type="hidden" name="_loaded_at" value="" data-contact-loaded-at />
      <!-- Honeypot field: hidden from humans, bots fill it out -->
      <div class="contact__honeypot" aria-hidden="true">
        <label>
          <span>Website</span>
          <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" />
        </label>
      </div>
      <label>
        <span class="micro-label">Name</span>
        <input type="text" name="name" required />
      </label>
      <label>
        <span class="micro-label">Email</span>
        <input type="email" name="email" required />
      </label>
      <label>
        <span class="micro-label">Message</span>
        <textarea name="message" rows="4" required></textarea>
      </label>
      <div class="contact__form-status" data-contact-status hidden></div>
      <button type="submit" class="btn btn--solid">Send</button>
    </form>`)}
  </section>`;
};

const renderBlogRoll = (section: Section & { type: 'blog-roll' }, options: RenderOptions): string => {
  const posts = section.posts ?? [];
  const items = posts
    .map((entry) => {
      const post = entry.postId && options.resolvePost ? options.resolvePost(entry.postId) : null;
      const href = post?.slug ? options.resolveLink(post.slug) : '#';
      const title = post?.title ?? 'Untitled entry';
      const detail = post?.publishedAt ?? '';
      const excerpt = post?.excerpt ?? '';
      const cover = post?.coverImage?.src ? `<div class="blog-entry__thumb"><img src="${escapeHtml(post.coverImage!.src)}" alt="${escapeHtml(post.coverImage!.alt ?? '')}" loading="lazy" /></div>` : '';
      return `<a class="blog-entry" href="${escapeHtml(href)}">
        ${cover}
        <div class="blog-entry__content">
          <div class="blog-entry__meta">
            <span>${escapeHtml(detail)}</span>
            ${entry.featured ? '<span class="micro-label">Featured</span>' : ''}
          </div>
          <h4>${escapeHtml(title)}</h4>
          ${optional(Boolean(excerpt), () => `<p class="blog-entry__excerpt">${escapeHtml(excerpt ?? '')}</p>`)}
        </div>
      </a>`;
    })
    .join('\n');

  return `<section class="section blog-roll stack">
    <div class="section__header stack">
      <p class="kicker">${escapeHtml(section.title)}</p>
      ${optional(Boolean(section.intro), () => `<p class="measure">${escapeHtml(section.intro ?? '')}</p>`)}
    </div>
    <div class="blog-roll__entries">
      ${items}
    </div>
  </section>`;
};

export const renderBlogPost = (post: BlogPost, options: RenderOptions): string => {
  const cover = post.coverImage ? `<figure class="blog-post__cover">${renderMedia(post.coverImage.src, post.coverImage.alt)}${optional(Boolean(post.coverImage.alt), () => `<figcaption class="micro-label">${escapeHtml(post.coverImage.alt ?? '')}</figcaption>`)}</figure>` : '';
  const blocks = renderProjectBlocks(post.blocks);
  return `<article class="blog-post stack">
    <header class="blog-post__header stack">
      <p class="micro-label">${escapeHtml(post.publishedAt)}</p>
      <h1 class="display">${escapeHtml(post.title)}</h1>
      ${optional(Boolean(post.excerpt), () => `<p class="measure">${escapeHtml(post.excerpt ?? '')}</p>`)}
    </header>
    ${cover}
    <div class="blog-post__body stack">
      ${blocks}
    </div>
  </article>`;
};

const renderByType = (section: Section, options: RenderOptions): string => {
  switch (section.type) {
    case 'hero':
      return renderHero(section, options);
    case 'projects-grid':
      return renderProjectsGrid(section, options);
    case 'single-project':
      return renderSingleProject(section, options);
    case 'text-columns':
      return renderTextColumns(section, options);
    case 'list-section':
      return renderListSection(section, options);
    case 'contact':
      return renderContact(section, options);
    case 'blog-roll':
      return renderBlogRoll(section, options);
    default:
      return '';
  }
};

export const renderSections = (
  sections: readonly Section[],
  options: RenderOptions,
): readonly string[] => sections.map((section) => renderByType(section, options));

