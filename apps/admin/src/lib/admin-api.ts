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

// =============================================================================
// Promotion API (Staging → Production)
// =============================================================================

export type PromotionStepResult = {
  step: 'content' | 'assets' | 'products';
  success: boolean;
  message: string;
  details?: string[];
};

export type PromotionResult = {
  success: boolean;
  steps: PromotionStepResult[];
  timestamp: string;
};

export type PromotionCheck = {
  valid: boolean;
  message: string;
};

export const checkPromotion = async (config: AdminRuntimeConfig): Promise<PromotionCheck> => {
  const response = await fetch(`${config.apiBaseUrl}/admin/promote/check`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<PromotionCheck>(response);
};

export const promoteAll = async (config: AdminRuntimeConfig): Promise<PromotionResult> => {
  const response = await fetch(`${config.apiBaseUrl}/admin/promote`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<PromotionResult>(response);
};

export const promoteContent = async (config: AdminRuntimeConfig): Promise<PromotionStepResult> => {
  const response = await fetch(`${config.apiBaseUrl}/admin/promote/content`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<PromotionStepResult>(response);
};

export const promoteAssets = async (config: AdminRuntimeConfig): Promise<PromotionStepResult> => {
  const response = await fetch(`${config.apiBaseUrl}/admin/promote/assets`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<PromotionStepResult>(response);
};

export const promoteProducts = async (config: AdminRuntimeConfig): Promise<PromotionStepResult> => {
  const response = await fetch(`${config.apiBaseUrl}/admin/promote/products`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<PromotionStepResult>(response);
};

// =============================================================================
// Stripe Sync API
// =============================================================================

export type SyncResult = {
  imported: number;
  updated: number;
  skipped: number;
  exported: number;
  errors: { message: string; productId?: string; stripeProductId?: string }[];
  timestamp: string;
};

export type SyncStatus = {
  cronEnabled: boolean;
  lastSync: SyncResult | null;
};

export const getSyncStatus = async (config: AdminRuntimeConfig): Promise<SyncStatus> => {
  const response = await fetch(`${config.apiBaseUrl}/stripe/sync`, {
    method: 'GET',
    credentials: 'include',
  });
  return handleResponse<SyncStatus>(response);
};

export const triggerImportSync = async (config: AdminRuntimeConfig): Promise<SyncResult> => {
  const response = await fetch(`${config.apiBaseUrl}/stripe/sync/import`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<SyncResult>(response);
};

export const triggerExportSync = async (config: AdminRuntimeConfig): Promise<SyncResult> => {
  const response = await fetch(`${config.apiBaseUrl}/stripe/sync/export`, {
    method: 'POST',
    credentials: 'include',
  });
  return handleResponse<SyncResult>(response);
};

