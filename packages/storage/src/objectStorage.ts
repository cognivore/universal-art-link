import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** Port interface for object storage. */
export type ObjectStoragePort = {
  readonly put: (key: string, data: Uint8Array, mime: string) => Promise<void>;
  readonly get: (key: string) => Promise<Uint8Array>;
  readonly delete: (key: string) => Promise<void>;
  readonly url: (key: string) => string;
};

/**
 * Filesystem-backed object storage (self-host mode).
 * Files stored under basePath with tenant-prefixed keys.
 */
export const createFilesystemStorage = (basePath: string): ObjectStoragePort => ({
  async put(key, data) {
    const fullPath = join(basePath, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, data);
  },

  async get(key) {
    const fullPath = join(basePath, key);
    const buf = await readFile(fullPath);
    return new Uint8Array(buf);
  },

  async delete(key) {
    const fullPath = join(basePath, key);
    await unlink(fullPath).catch(() => undefined);
  },

  url(key) {
    return `/media/${key}`;
  },
});

/**
 * S3-compatible storage stub (hosted mode).
 * Real implementation would use @aws-sdk/client-s3.
 */
export const createS3Storage = (
  _bucket: string,
  _region: string,
  publicUrlBase: string,
): ObjectStoragePort => ({
  async put(_key, _data, _mime) {
    throw new Error('S3 storage not yet implemented');
  },

  async get(_key) {
    throw new Error('S3 storage not yet implemented');
  },

  async delete(_key) {
    throw new Error('S3 storage not yet implemented');
  },

  url(key) {
    return `${publicUrlBase}/${key}`;
  },
});
