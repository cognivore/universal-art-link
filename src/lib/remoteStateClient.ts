import { DeployState, DeployStateSchema } from './deployState.js';

/**
 * Client for interacting with the deploy-receiver's state endpoints.
 */

export type RemoteConfig = {
  readonly endpoint: string;
  readonly secret: string;
  readonly siteId?: string;
};

export type RemoteStateResponse = {
  readonly seeded: boolean;
  readonly state: DeployState | null;
};

export type ContentFilesResponse = {
  readonly files: Record<string, string>;
};

const makeHeaders = (config: RemoteConfig): Record<string, string> => {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.secret}`,
  };
  if (config.siteId) {
    headers['x-site-id'] = config.siteId;
  }
  return headers;
};

/**
 * Fetches the current deploy state from the remote server.
 */
export const fetchRemoteState = async (config: RemoteConfig): Promise<RemoteStateResponse> => {
  const url = new URL('/state', config.endpoint).toString();
  const response = await fetch(url, {
    method: 'GET',
    headers: makeHeaders(config),
  });

  if (response.status === 404) {
    return { seeded: false, state: null };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch remote state: ${response.status} ${text}`);
  }

  const data = await response.json() as { seeded: boolean; state: unknown };

  if (!data.seeded || !data.state) {
    return { seeded: false, state: null };
  }

  const parsed = DeployStateSchema.safeParse(data.state);
  if (!parsed.success) {
    throw new Error(`Invalid remote state: ${parsed.error.message}`);
  }

  return { seeded: true, state: parsed.data };
};

/**
 * Updates the deploy state on the remote server.
 */
export const updateRemoteState = async (config: RemoteConfig, state: DeployState): Promise<void> => {
  const url = new URL('/state', config.endpoint).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...makeHeaders(config),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(state),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update remote state: ${response.status} ${text}`);
  }
};

/**
 * Fetches content YAML files from the remote server for validation.
 */
export const fetchRemoteContent = async (config: RemoteConfig): Promise<ContentFilesResponse> => {
  const url = new URL('/content', config.endpoint).toString();
  const response = await fetch(url, {
    method: 'GET',
    headers: makeHeaders(config),
  });

  if (response.status === 404) {
    return { files: {} };
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch remote content: ${response.status} ${text}`);
  }

  const data = await response.json() as { files: Record<string, string> };
  return { files: data.files ?? {} };
};

/**
 * Uploads a zip bundle to seed content on the remote server.
 */
export const seedRemoteContent = async (
  config: RemoteConfig,
  zipBuffer: Buffer,
  force = false,
): Promise<void> => {
  const url = new URL('/seed', config.endpoint).toString();
  const headers = makeHeaders(config);
  if (force) {
    headers['x-force-seed'] = 'true';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/zip',
    },
    body: zipBuffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to seed remote content: ${response.status} ${text}`);
  }
};

/**
 * Deploys a code-only bundle to the remote server.
 */
export const deployCodeBundle = async (
  config: RemoteConfig,
  zipBuffer: Buffer,
): Promise<{ release: string }> => {
  const url = new URL('/deploy', config.endpoint).toString();
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...makeHeaders(config),
      'Content-Type': 'application/zip',
      'x-deploy-mode': 'code-only',
    },
    body: zipBuffer,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to deploy: ${response.status} ${text}`);
  }

  const data = await response.json() as { release: string };
  return data;
};

