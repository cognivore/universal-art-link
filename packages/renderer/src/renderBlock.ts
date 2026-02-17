import type { BlockModel } from '@ual/core';

/** Render a single block to an HTML string fragment. Pure function. */
export const renderBlock = (block: BlockModel): string => {
  switch (block.type) {
    case 'hero':
      return [
        '<section class="block block--hero">',
        block.props.heading ? `<h1>${esc(block.props.heading)}</h1>` : '',
        block.props.subheading ? `<p class="hero-sub">${esc(block.props.subheading)}</p>` : '',
        block.props.ctaUrl
          ? `<a href="${esc(block.props.ctaUrl)}" class="cta">${esc(block.props.ctaLabel)}</a>`
          : '',
        '</section>',
      ].join('\n');

    case 'text':
      return `<section class="block block--text" style="text-align:${block.props.alignment}">\n<div>${esc(block.props.body)}</div>\n</section>`;

    case 'image':
      return [
        `<figure class="block block--image${block.props.fullBleed ? ' block--full-bleed' : ''}">`,
        block.props.mediaId
          ? `<img src="/media/${esc(block.props.mediaId)}" alt="${esc(block.props.alt)}" />`
          : '',
        block.props.caption ? `<figcaption>${esc(block.props.caption)}</figcaption>` : '',
        '</figure>',
      ].join('\n');

    case 'imageGrid':
      return [
        `<section class="block block--image-grid" style="--columns:${block.props.columns}">`,
        ...block.props.images.map((img) =>
          `<figure><img src="/media/${esc(img.mediaId)}" alt="${esc(img.alt)}" />${img.caption ? `<figcaption>${esc(img.caption)}</figcaption>` : ''}</figure>`,
        ),
        '</section>',
      ].join('\n');

    case 'quote':
      return [
        '<blockquote class="block block--quote">',
        `<p>${esc(block.props.text)}</p>`,
        block.props.attribution ? `<cite>${esc(block.props.attribution)}</cite>` : '',
        '</blockquote>',
      ].join('\n');

    case 'embed':
      return block.props.url
        ? `<section class="block block--embed"><iframe src="${esc(block.props.url)}" loading="lazy"></iframe>${block.props.caption ? `<p>${esc(block.props.caption)}</p>` : ''}</section>`
        : '';

    case 'projectsGrid':
      return `<section class="block block--projects-grid" style="--columns:${block.props.columns}"><!-- projects: ${block.props.projectIds.join(', ')} --></section>`;

    case 'contactForm':
      return [
        '<section class="block block--contact-form">',
        block.props.heading ? `<h2>${esc(block.props.heading)}</h2>` : '',
        block.props.description ? `<p>${esc(block.props.description)}</p>` : '',
        block.props.email ? `<a href="mailto:${esc(block.props.email)}" class="cta">${esc(block.props.email)}</a>` : '',
        '</section>',
      ].join('\n');

    case 'blogRoll':
      return `<section class="block block--blog-roll"><!-- blogRoll maxPosts=${block.props.maxPosts} --></section>`;

    default:
      return `<!-- unknown block type -->`;
  }
};

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;');
