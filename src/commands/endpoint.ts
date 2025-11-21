import fs from 'fs-extra';
import path from 'node:path';
import { startDeployEndpoint } from '../lib/endpointServer.js';
import { log } from '../lib/logger.js';

type EndpointOptions = {
  readonly port?: number;
  readonly host?: string;
  readonly secret?: string;
  readonly target?: string;
};

export const runEndpointCommand = async ({ port = 8080, host = '0.0.0.0', secret, target }: EndpointOptions = {}): Promise<void> => {
  const resolvedSecret = secret ?? process.env.UAL_DEPLOY_SECRET;
  if (!resolvedSecret) {
    throw new Error('Provide a shared secret via --secret or UAL_DEPLOY_SECRET.');
  }

  const rootDir = process.cwd();
  const targetDir = path.resolve(rootDir, target ?? './deployed-site');
  await fs.ensureDir(targetDir);

  const server = startDeployEndpoint({
    port,
    host,
    secret: resolvedSecret,
    targetDir,
    logger: log,
  });

  log.success(`Deploy endpoint ready on http://${host}:${port}`);
  log.info(`Writing extracted files into ${targetDir}`);

  const shutdown = async (): Promise<void> => {
    log.info('Shutting down deploy endpoint…');
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown();
  });
  process.on('SIGTERM', () => {
    void shutdown();
  });
};


