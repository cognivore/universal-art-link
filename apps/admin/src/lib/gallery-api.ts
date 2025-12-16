import type { AdminRuntimeConfig } from './runtime-config';
import { getRuntimeConfig } from './runtime-config';

export type Asset = {
  filename: string;
  url: string;
  type: string;
  size: number;
  modifiedAt: string;
};

export type AssetsResponse = {
  assets: Asset[];
};

export type UploadResponse = {
  url: string;
  filename: string;
};

const getApiBase = () => {
  const config = getRuntimeConfig();
  return config.previewBaseUrl;
};

/**
 * Fetch all assets from the gallery
 */
export const fetchAssets = async (): Promise<Asset[]> => {
  const response = await fetch(`${getApiBase()}/__ual/api/assets`, {
    method: 'GET',
    credentials: 'include',
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Failed to fetch assets');
  }

  const data = await response.json() as AssetsResponse;
  return data.assets;
};

/**
 * Upload a new asset to the gallery
 */
export const uploadAsset = async (file: File): Promise<UploadResponse> => {
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type. Allowed: jpeg, png, gif, webp, svg');
  }

  // Validate file size (max 5MB)
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('File too large. Maximum size is 5MB');
  }

  // Convert to base64
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64Data = result.split(',')[1];
      resolve(base64Data ?? '');
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });

  // Upload to server
  const response = await fetch(`${getApiBase()}/__ual/api/assets/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      filename: file.name,
      data: base64,
      mimeType: file.type,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Upload failed');
  }

  return response.json() as Promise<UploadResponse>;
};

/**
 * Get full URL for an asset (handles relative vs absolute URLs)
 */
export const getAssetUrl = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  return `${getApiBase()}${url}`;
};

/**
 * Format file size for display
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

