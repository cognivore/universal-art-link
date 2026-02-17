import { mkdir, writeFile, symlink, unlink, readlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { renderSite } from '@ual/renderer';
import type { SiteModel } from '@ual/core';
import type { SnapshotRepo } from '@ual/storage';
import pino from 'pino';

const log = pino({ name: 'publish-handler' });

const RELEASES_BASE = process.env['RELEASES_BASE'] ?? './releases';

export type PublishJobData = {
  jobId: string;
  tenantId: string;
  snapshotId: string;
};

/**
 * Handle a publish job:
 * 1. Load snapshot site_json
 * 2. Render to HTML
 * 3. Write revision directory
 * 4. Atomic symlink switch
 * 5. Update published_revisions
 */
export const handlePublish = (snapshotRepo: SnapshotRepo) =>
  async (data: PublishJobData): Promise<void> => {
    const { jobId, tenantId, snapshotId } = data;
    log.info({ jobId, tenantId, snapshotId }, 'Starting publish');

    await snapshotRepo.updatePublishJob(jobId, 'running');

    try {
      const snapshot = await snapshotRepo.findById(snapshotId, tenantId);
      if (!snapshot) throw new Error('Snapshot not found');

      const siteModel = snapshot.siteJson as SiteModel;
      if (!siteModel?.config || !siteModel?.pages) {
        throw new Error('Snapshot has no valid site_json; re-snapshot required');
      }

      const revisionId = randomUUID();
      const buildId = revisionId.slice(0, 8);
      const pages = renderSite(siteModel, buildId);

      const revisionDir = join(RELEASES_BASE, tenantId, revisionId);
      await mkdir(revisionDir, { recursive: true });

      for (const page of pages) {
        const slug = page.slug === '/' || page.slug === '' ? 'index' : page.slug;
        const dir = join(revisionDir, slug);
        await mkdir(dir, { recursive: true });
        await writeFile(join(dir, 'index.html'), page.html, 'utf-8');
      }

      const currentLink = join(RELEASES_BASE, tenantId, 'current');
      const tmpLink = currentLink + '.tmp.' + revisionId.slice(0, 8);

      await symlink(revisionDir, tmpLink).catch(() => undefined);
      await unlink(currentLink).catch(() => undefined);
      await symlink(revisionDir, currentLink).catch(async () => {
        await unlink(tmpLink).catch(() => undefined);
      });
      await unlink(tmpLink).catch(() => undefined);

      await snapshotRepo.setPublishedRevision(tenantId, snapshotId);
      await snapshotRepo.updatePublishJob(jobId, 'success', {
        revisionId,
        pageCount: pages.length,
      });

      log.info({ jobId, revisionId, pageCount: pages.length }, 'Publish complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ jobId, err: message }, 'Publish failed');
      await snapshotRepo.updatePublishJob(jobId, 'failed', { error: message });
      throw err;
    }
  };
