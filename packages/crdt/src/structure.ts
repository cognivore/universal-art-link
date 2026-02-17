import * as Y from 'yjs';
import type { SiteConfig, PageModel, BlockModel } from '@ual/core';

/**
 * Y.Doc structure (section 6.1):
 *   site: Y.Map
 *     config: Y.Map (theme tokens, nav, SEO)
 *     pages: Y.Array<Y.Map>
 *       each page: Y.Map { id, slug, title, seo, status, blocks: Y.Array<Y.Map> }
 *         each block: Y.Map { type, id, props: Y.Map }
 */

/** Get or create the root site map on a Y.Doc. */
export const getSiteMap = (doc: Y.Doc): Y.Map<unknown> =>
  doc.getMap('site');

export const getConfigMap = (doc: Y.Doc): Y.Map<unknown> => {
  const site = getSiteMap(doc);
  if (!site.has('config')) {
    site.set('config', new Y.Map());
  }
  return site.get('config') as Y.Map<unknown>;
};

export const getPagesArray = (doc: Y.Doc): Y.Array<Y.Map<unknown>> => {
  const site = getSiteMap(doc);
  if (!site.has('pages')) {
    site.set('pages', new Y.Array());
  }
  return site.get('pages') as Y.Array<Y.Map<unknown>>;
};

/** Convert a plain config object to Y.Map entries. */
export const configToYMap = (config: SiteConfig, map: Y.Map<unknown>): void => {
  map.set('title', config.title);
  map.set('description', config.description);
  map.set('favicon', config.favicon);

  const palette = new Y.Map();
  for (const [k, v] of Object.entries(config.palette)) {
    palette.set(k, v);
  }
  map.set('palette', palette);

  const typography = new Y.Map();
  for (const [k, v] of Object.entries(config.typography)) {
    typography.set(k, v);
  }
  map.set('typography', typography);

  const spacing = new Y.Map();
  spacing.set('unit', config.spacing.unit);
  const scaleArr = new Y.Array<number>();
  scaleArr.push(config.spacing.scale);
  spacing.set('scale', scaleArr);
  map.set('spacing', spacing);

  const radii = new Y.Map();
  for (const [k, v] of Object.entries(config.radii)) {
    radii.set(k, v);
  }
  map.set('radii', radii);

  const navArr = new Y.Array<Y.Map<string>>();
  for (const item of config.navigation) {
    const navMap = new Y.Map<string>();
    navMap.set('label', item.label);
    navMap.set('slug', item.slug);
    navArr.push([navMap]);
  }
  map.set('navigation', navArr);

  const seo = new Y.Map();
  seo.set('ogImage', config.seo.ogImage);
  seo.set('twitterHandle', config.seo.twitterHandle);
  map.set('seo', seo);
};

/** Convert a BlockModel to a Y.Map. */
export const blockToYMap = (block: BlockModel): Y.Map<unknown> => {
  const map = new Y.Map<unknown>();
  map.set('type', block.type);
  map.set('id', block.id);

  const propsMap = new Y.Map<unknown>();
  for (const [k, v] of Object.entries(block.props)) {
    if (Array.isArray(v)) {
      const arr = new Y.Array();
      arr.push(v);
      propsMap.set(k, arr);
    } else {
      propsMap.set(k, v);
    }
  }
  map.set('props', propsMap);

  return map;
};

/** Convert a PageModel to a Y.Map. */
export const pageToYMap = (page: PageModel): Y.Map<unknown> => {
  const map = new Y.Map<unknown>();
  map.set('id', page.id);
  map.set('slug', page.slug);
  map.set('title', page.title);
  map.set('status', page.status);

  const seo = new Y.Map<string>();
  seo.set('title', page.seo.title);
  seo.set('description', page.seo.description);
  seo.set('ogImage', page.seo.ogImage);
  map.set('seo', seo);

  const blocksArr = new Y.Array<Y.Map<unknown>>();
  for (const block of page.blocks) {
    blocksArr.push([blockToYMap(block)]);
  }
  map.set('blocks', blocksArr);

  return map;
};
