import type { SiteModel } from '@ual/core';
import { renderPage, type RenderedPage } from './renderPage.js';

/**
 * Render an entire site from a SiteModel.
 * Pure pipeline: SiteModel -> Array<RenderedPage>.
 * Deterministic: same input always produces same output.
 */
export const renderSite = (model: SiteModel, buildId: string): ReadonlyArray<RenderedPage> =>
  model.pages
    .filter((p) => p.status !== 'archived')
    .map((page) => renderPage(page, model.config, buildId));
