import * as Y from 'yjs';
import type { SiteModel, SiteConfig, PageModel, BlockModel, BlockType } from '@ual/core';
import { emptySiteModel } from '@ual/core';
import {
  getSiteMap,
  getConfigMap,
  getPagesArray,
  configToYMap,
  pageToYMap,
} from './structure.js';

/** Extract a plain object from a Y.Map, recursively converting nested types. */
const yMapToPlain = (map: Y.Map<unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  for (const [key, value] of map.entries()) {
    if (value instanceof Y.Map) {
      result[key] = yMapToPlain(value);
    } else if (value instanceof Y.Array) {
      result[key] = yArrayToPlain(value);
    } else if (value instanceof Y.Text) {
      result[key] = value.toString();
    } else {
      result[key] = value;
    }
  }
  return result;
};

const yArrayToPlain = (arr: Y.Array<unknown>): unknown[] => {
  const result: unknown[] = [];
  for (let i = 0; i < arr.length; i++) {
    const item = arr.get(i);
    if (item instanceof Y.Map) {
      result.push(yMapToPlain(item));
    } else if (item instanceof Y.Array) {
      result.push(yArrayToPlain(item));
    } else {
      result.push(item);
    }
  }
  return result;
};

/** Extract SiteModel from a Y.Doc (pure conversion). */
export const docToSiteModel = (doc: Y.Doc): SiteModel => {
  const site = getSiteMap(doc);
  if (site.size === 0) return emptySiteModel();

  const configMap = site.get('config') as Y.Map<unknown> | undefined;
  const config = configMap ? yMapToPlain(configMap) as unknown as SiteConfig : emptySiteModel().config;

  const pagesArr = site.get('pages') as Y.Array<Y.Map<unknown>> | undefined;
  const pages: PageModel[] = [];

  if (pagesArr) {
    for (let i = 0; i < pagesArr.length; i++) {
      const pageMap = pagesArr.get(i);
      const plain = yMapToPlain(pageMap);

      const blocksRaw = plain['blocks'] as Array<Record<string, unknown>> | undefined;
      const blocks: BlockModel[] = (blocksRaw ?? []).map((b) => ({
        type: b['type'] as BlockType,
        id: b['id'] as string,
        props: b['props'] as Record<string, unknown>,
      })) as BlockModel[];

      pages.push({
        id: plain['id'] as string,
        slug: plain['slug'] as string,
        title: plain['title'] as string,
        status: (plain['status'] as PageModel['status']) ?? 'draft',
        seo: {
          title: ((plain['seo'] as Record<string, string>)?.['title']) ?? '',
          description: ((plain['seo'] as Record<string, string>)?.['description']) ?? '',
          ogImage: ((plain['seo'] as Record<string, string>)?.['ogImage']) ?? '',
        },
        blocks,
      });
    }
  }

  return { config, pages, media: {} };
};

/** Seed a Y.Doc from a SiteModel (used for initial setup or rollback). */
export const siteModelToDoc = (model: SiteModel): Y.Doc => {
  const doc = new Y.Doc();

  doc.transact(() => {
    const configMap = getConfigMap(doc);
    configToYMap(model.config, configMap);

    const pagesArr = getPagesArray(doc);
    for (const page of model.pages) {
      pagesArr.push([pageToYMap(page)]);
    }
  });

  return doc;
};
