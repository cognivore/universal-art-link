import { buildSite } from './build.js';
import { createZipFromDist } from './packageSite.js';
import { deployZipBundle } from './deploy.js';
import { Logger } from './logger.js';
import {
  ConnectionRecord,
  deleteConnectionRecord,
  readConnectionRecord,
  writeConnectionRecord,
} from './connectionStore.js';

type PublicConnection = {
  readonly baseUrl: string;
  readonly remoteName?: string;
  readonly targetPath?: string;
  readonly connectedAt: string;
  readonly lastVerifiedAt: string;
  readonly lastDeployAt?: string;
};

type DeploySnapshot = {
  readonly status: 'info' | 'success' | 'error';
  readonly message: string;
  readonly finishedAt: string;
};

export type AdminState = {
  readonly connection?: PublicConnection;
  readonly isDeploying: boolean;
  readonly lastDeploy?: DeploySnapshot;
};

export type ConnectPayload = {
  readonly baseUrl: string;
  readonly secret: string;
};

const normalizeBaseUrl = (input: string): string => {
  if (!input) {
    throw new Error('Provide a deployment endpoint URL.');
  }
  try {
    const candidate = input.startsWith('http://') || input.startsWith('https://') ? input : `https://${input}`;
    const url = new URL(candidate);
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.origin}${pathname}`;
  } catch (error) {
    throw new Error(`Invalid remote URL: ${input}`);
  }
};

const performHandshake = async (
  connectEndpoint: string,
  secret: string,
): Promise<{ readonly remoteName?: string; readonly targetPath?: string }> => {
  const response = await fetch(connectEndpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client: 'ual-admin',
      timestamp: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Handshake failed (${response.status})`);
  }

  try {
    const payload = (await response.json()) as { readonly remoteName?: string; readonly targetPath?: string };
    return payload;
  } catch {
    return {};
  }
};

const toPublicConnection = (record: ConnectionRecord): PublicConnection => ({
  baseUrl: record.baseUrl,
  remoteName: record.remoteName,
  targetPath: record.targetPath,
  connectedAt: record.connectedAt,
  lastVerifiedAt: record.lastVerifiedAt,
  lastDeployAt: record.lastDeployAt,
});

export class AdminService {
  private deploying = false;
  private lastDeploy: DeploySnapshot | undefined;

  constructor(private readonly rootDir: string, private readonly logger: Logger) {}

  async getState(): Promise<AdminState> {
    const record = await readConnectionRecord(this.rootDir);
    return {
      connection: record ? toPublicConnection(record) : undefined,
      isDeploying: this.deploying,
      lastDeploy: this.lastDeploy,
    };
  }

  async connect(payload: ConnectPayload): Promise<PublicConnection> {
    if (!payload.secret) {
      throw new Error('Provide a shared secret.');
    }
    const baseUrl = normalizeBaseUrl(payload.baseUrl);
    const baseWithSlash = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    const connectEndpoint = new URL('connect', baseWithSlash).toString();
    const deployEndpoint = new URL('deploy', baseWithSlash).toString();
    this.logger.info(`Connecting to remote ${baseUrl}`);
    const handshake = await performHandshake(connectEndpoint, payload.secret);

    const timestamp = new Date().toISOString();
    const record: ConnectionRecord = {
      baseUrl,
      connectEndpoint,
      deployEndpoint,
      secret: payload.secret,
      remoteName: handshake.remoteName,
      targetPath: handshake.targetPath,
      connectedAt: timestamp,
      lastVerifiedAt: timestamp,
    };

    await writeConnectionRecord(this.rootDir, record);
    this.logger.success(`Remote ${baseUrl} verified`);
    return toPublicConnection(record);
  }

  async disconnect(): Promise<void> {
    await deleteConnectionRecord(this.rootDir);
    this.logger.info('Removed saved connection');
  }

  async deploy(): Promise<{ readonly message: string }> {
    if (this.deploying) {
      throw new Error('Deployment already running.');
    }
    const record = await readConnectionRecord(this.rootDir);
    if (!record) {
      throw new Error('Connect to a remote host before deploying.');
    }

    this.deploying = true;
    this.logger.info('Building site for deployment…');
    const startedAt = Date.now();
    try {
      const buildResult = await buildSite({ rootDir: this.rootDir, invalidateTemplates: true });
      const zipPath = await createZipFromDist(buildResult.outputDir);
      this.logger.info(`Uploading bundle (${zipPath}) to ${record.deployEndpoint}`);

      const response = await deployZipBundle(zipPath, {
        endpoint: record.deployEndpoint,
        method: 'POST',
        authHeader: `Bearer ${record.secret}`,
      });

      const duration = ((Date.now() - startedAt) / 1000).toFixed(1);
      const message = `Remote acknowledged deploy (${response.status}) in ${duration}s`;
      const finishedAt = new Date().toISOString();
      this.lastDeploy = { status: 'success', message, finishedAt };

      const updated: ConnectionRecord = { ...record, lastDeployAt: finishedAt };
      await writeConnectionRecord(this.rootDir, updated);
      this.logger.success(message);
      return { message };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Deployment failed';
      const finishedAt = new Date().toISOString();
      this.lastDeploy = { status: 'error', message, finishedAt };
      this.logger.error('Deploy failed', error);
      throw error instanceof Error ? error : new Error(message);
    } finally {
      this.deploying = false;
    }
  }
}

