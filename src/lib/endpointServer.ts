import AdmZip from 'adm-zip';
import fs from 'fs-extra';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Logger } from './logger.js';

export type EndpointServerOptions = {
  readonly host?: string;
  readonly port: number;
  readonly secret: string;
  readonly targetDir: string;
  readonly logger: Logger;
};

export type EndpointServer = {
  readonly close: () => Promise<void>;
};

const unauthorized = (res: http.ServerResponse<http.IncomingMessage>): void => {
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ message: 'Unauthorized' }));
};

const sendJson = (res: http.ServerResponse<http.IncomingMessage>, status: number, payload: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const verifySecret = (req: http.IncomingMessage, secret: string): boolean => {
  const header = req.headers.authorization ?? '';
  return header === `Bearer ${secret}`;
};

const saveIncomingZip = async (req: http.IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    void fs
      .mkdtemp(path.join(os.tmpdir(), 'ual-upload-'))
      .then((dir) => {
        const targetPath = path.join(dir, 'upload.zip');
        const writeStream = fs.createWriteStream(targetPath);
        let total = 0;
        const maxBytes = 250 * 1024 * 1024;
        req.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy();
            writeStream.destroy();
            reject(new Error('Upload too large'));
          }
        });
        req.pipe(writeStream);
        writeStream.on('finish', () => resolve(targetPath));
        writeStream.on('error', reject);
        req.on('error', reject);
        req.on('aborted', () => reject(new Error('Upload aborted')));
      })
      .catch(reject);
  });

const extractZipInto = async (zipPath: string, targetDir: string): Promise<void> => {
  const zip = new AdmZip(zipPath);
  await fs.ensureDir(targetDir);
  await fs.emptyDir(targetDir);
  zip.extractAllTo(targetDir, true);
};

export const startDeployEndpoint = ({
  host = '0.0.0.0',
  port,
  secret,
  targetDir,
  logger,
}: EndpointServerOptions): EndpointServer => {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    if (!verifySecret(req, secret)) {
      unauthorized(res);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/connect') {
      sendJson(res, 200, { remoteName: 'UAL Deploy Relay', targetPath: targetDir });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/deploy') {
      let zipPath: string | undefined;
      try {
        zipPath = await saveIncomingZip(req);
        await extractZipInto(zipPath, targetDir);
        logger.success(`Deployed bundle into ${targetDir}`);
        sendJson(res, 200, { message: 'Deployed successfully' });
      } catch (error) {
        logger.error('Failed to deploy bundle', error);
        sendJson(res, 500, { message: error instanceof Error ? error.message : 'Deploy failed' });
      } finally {
        if (zipPath) {
          await fs.remove(path.dirname(zipPath)).catch(() => undefined);
        }
      }
      return;
    }

    sendJson(res, 404, { message: 'Unknown endpoint' });
  });

  server.listen(port, host, () => {
    logger.info(`Deploy endpoint listening on http://${host}:${port}`);
  });

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

  return { close };
};

