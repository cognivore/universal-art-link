import { getRuntimeConfig } from './runtime-config';

export type AuthSession = {
  authenticated: boolean;
  user?: {
    email: string;
    name: string;
  };
  expiresAt?: number;
  isSanta?: boolean;
};

export type RequestLinkResponse = {
  message: string;
  _devMagicLink?: string;
};

const getApiBase = () => {
  const config = getRuntimeConfig();
  return config.previewBaseUrl;
};

export const requestMagicLink = async (email: string): Promise<RequestLinkResponse> => {
  const response = await fetch(`${getApiBase()}/__ual/auth/request-link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to request magic link');
  }

  return response.json();
};

export const getSession = async (): Promise<AuthSession> => {
  const response = await fetch(`${getApiBase()}/__ual/auth/session`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    return { authenticated: false };
  }

  return response.json();
};

export const logout = async (): Promise<void> => {
  await fetch(`${getApiBase()}/__ual/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
};

// =============================================================================
// Admin Settings API
// =============================================================================

export type StagingBypassState = {
  enabled: boolean;
  source: 'runtime' | 'env' | 'default';
};

export const getStagingBypassState = async (): Promise<StagingBypassState> => {
  const response = await fetch(`${getApiBase()}/__ual/api/admin/settings/staging-bypass`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to get staging bypass state');
  }

  return response.json();
};

export const setStagingBypass = async (enabled: boolean | null): Promise<StagingBypassState> => {
  const response = await fetch(`${getApiBase()}/__ual/api/admin/settings/staging-bypass`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ enabled }),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to set staging bypass');
  }

  return response.json();
};

