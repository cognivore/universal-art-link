import fs from 'fs-extra';
import path from 'node:path';

export type ConnectionRecord = {
  readonly baseUrl: string;
  readonly connectEndpoint: string;
  readonly deployEndpoint: string;
  readonly secret: string;
  readonly remoteName?: string;
  readonly targetPath?: string;
  readonly connectedAt: string;
  readonly lastVerifiedAt: string;
  readonly lastDeployAt?: string;
};

const connectionPath = (rootDir: string): string => path.join(rootDir, '.ual', 'connection.json');

export const readConnectionRecord = async (rootDir: string): Promise<ConnectionRecord | null> => {
  const filePath = connectionPath(rootDir);
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    return null;
  }
  const record = await fs.readJson(filePath);
  return record as ConnectionRecord;
};

export const writeConnectionRecord = async (rootDir: string, record: ConnectionRecord): Promise<void> => {
  const filePath = connectionPath(rootDir);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeJson(filePath, record, { spaces: 2 });
};

export const deleteConnectionRecord = async (rootDir: string): Promise<void> => {
  const filePath = connectionPath(rootDir);
  await fs.remove(filePath);
};


