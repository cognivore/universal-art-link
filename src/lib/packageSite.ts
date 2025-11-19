import archiver from 'archiver';
import fs from 'fs-extra';
import path from 'node:path';

const timestamp = (): string => {
  const date = new Date();
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
};

export const createZipFromDist = async (distDir: string): Promise<string> => {
  const zipName = `site-${timestamp()}.zip`;
  const zipPath = path.join(distDir, zipName);

  await fs.ensureDir(distDir);
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', (error) => reject(error));
  });

  archive.pipe(output);
  archive.glob('**/*', {
    cwd: distDir,
    dot: true,
    ignore: [zipName],
  });
  await archive.finalize();
  await done;
  return zipPath;
};

