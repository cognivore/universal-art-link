import type { AdminRuntimeConfig } from './runtime-config';

export type RemoteConnection = {
  baseUrl: string;
  remoteName?: string;
  targetPath?: string;
  lastVerifiedAt?: string;
};

export type DeployStatus = {
  message: string;
  status: 'info' | 'success' | 'error';
};

export type AdminStatePayload = {
  connection: RemoteConnection | null;
  isDeploying: boolean;
  lastDeploy?: DeployStatus | null;
};

const jsonHeaders = { 'Content-Type': 'application/json' };

const handleResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { message?: string })?.message ?? 'Request failed';
    throw new Error(message);
  }
  return payload as T;
};

export const fetchAdminState = async (config: AdminRuntimeConfig): Promise<AdminStatePayload> => {
  const response = await fetch(`${config.apiBaseUrl}/state`, { credentials: 'include' });
  return handleResponse<AdminStatePayload>(response);
};

export const connectRemote = async (
  config: AdminRuntimeConfig,
  input: { baseUrl: string; secret: string }
): Promise<AdminStatePayload> => {
  const response = await fetch(`${config.apiBaseUrl}/connect`, {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(input)
  });
  return handleResponse<AdminStatePayload>(response);
};

export const disconnectRemote = async (config: AdminRuntimeConfig): Promise<void> => {
  await fetch(`${config.apiBaseUrl}/disconnect`, {
    method: 'POST',
    credentials: 'include'
  });
};

export const deploySite = async (config: AdminRuntimeConfig): Promise<DeployStatus> => {
  const response = await fetch(`${config.apiBaseUrl}/deploy`, {
    method: 'POST',
    credentials: 'include'
  });
  return handleResponse<{ message: string }>(response).then((payload) => ({
    message: payload.message ?? 'Deployment triggered',
    status: 'success'
  }));
};

