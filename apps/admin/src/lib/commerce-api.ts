import type { AdminRuntimeConfig } from './runtime-config';

export type CommerceMerchant = {
  id: string;
  name: string;
  slug: string;
  shopDomain: string;
  logoUrl?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CommerceItem = {
  id: string;
  merchantId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  shopifyVariantId: string;
  displayPrice?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CommerceCatalog = {
  hero?: {
    title?: string;
    body?: string;
    ctaLabel?: string;
    ctaHref?: string;
  };
  emptyState?: {
    title?: string;
    body?: string;
  };
};

export type ShopConfig = {
  domain: string;
  name: string;
  description?: string;
  logoUrl?: string;
  storefrontAccessToken?: string;
  featuredCollection?: string;
  cartNote?: string;
};

export type CommerceSnapshot = {
  merchants: CommerceMerchant[];
  items: CommerceItem[];
  catalog?: CommerceCatalog;
  shop?: ShopConfig;
  enableMultiMerchant?: boolean;
};

export type MerchantPayload = {
  name: string;
  slug?: string;
  shopDomain: string;
  logoUrl?: string;
  description?: string;
  isActive?: boolean;
};

export type MerchantPatch = Partial<MerchantPayload>;

export type ItemPayload = {
  merchantId: string;
  title: string;
  description?: string;
  imageUrl?: string;
  shopifyVariantId: string;
  displayPrice?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type ItemPatch = Partial<Omit<ItemPayload, 'merchantId'>> & {
  shopifyVariantId?: string;
};

const withBase = (config: AdminRuntimeConfig, path = ''): string =>
  `${config.apiBaseUrl}/commerce${path}`;

const jsonHeaders = { 'Content-Type': 'application/json' };

const handleResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = (payload as { message?: string }).message ?? 'Request failed';
    throw new Error(message);
  }
  return payload as T;
};

export const fetchCommerceSnapshot = async (config: AdminRuntimeConfig): Promise<CommerceSnapshot> => {
  const response = await fetch(withBase(config), { credentials: 'include' });
  return handleResponse<CommerceSnapshot>(response);
};

export const createCommerceMerchant = async (
  config: AdminRuntimeConfig,
  payload: MerchantPayload,
): Promise<CommerceMerchant> => {
  const response = await fetch(withBase(config, '/merchants'), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<CommerceMerchant>(response);
};

export const updateCommerceMerchant = async (
  config: AdminRuntimeConfig,
  merchantId: string,
  payload: MerchantPatch,
): Promise<CommerceMerchant> => {
  const response = await fetch(withBase(config, `/merchants/${merchantId}`), {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<CommerceMerchant>(response);
};

export const deleteCommerceMerchant = async (config: AdminRuntimeConfig, merchantId: string): Promise<void> => {
  await fetch(withBase(config, `/merchants/${merchantId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
};

export const createCommerceItem = async (
  config: AdminRuntimeConfig,
  merchantId: string,
  payload: ItemPayload,
): Promise<CommerceItem> => {
  const response = await fetch(withBase(config, `/merchants/${merchantId}/items`), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<CommerceItem>(response);
};

export const updateCommerceItem = async (
  config: AdminRuntimeConfig,
  itemId: string,
  payload: ItemPatch,
): Promise<CommerceItem> => {
  const response = await fetch(withBase(config, `/items/${itemId}`), {
    method: 'PATCH',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<CommerceItem>(response);
};

export const deleteCommerceItem = async (config: AdminRuntimeConfig, itemId: string): Promise<void> => {
  await fetch(withBase(config, `/items/${itemId}`), {
    method: 'DELETE',
    credentials: 'include',
  });
};

export const saveCommerceCatalog = async (
  config: AdminRuntimeConfig,
  payload: CommerceCatalog,
): Promise<CommerceCatalog> => {
  const response = await fetch(withBase(config, '/catalog'), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<CommerceCatalog>(response);
};

export const getShopConfig = async (config: AdminRuntimeConfig): Promise<ShopConfig | null> => {
  const response = await fetch(withBase(config, '/shop'), {
    credentials: 'include',
  });
  return handleResponse<ShopConfig>(response);
};

export const saveShopConfig = async (
  config: AdminRuntimeConfig,
  payload: Partial<ShopConfig>,
): Promise<ShopConfig> => {
  const response = await fetch(withBase(config, '/shop'), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify(payload),
  });
  return handleResponse<ShopConfig>(response);
};

export const toggleMultiMerchantMode = async (
  config: AdminRuntimeConfig,
  enabled: boolean,
): Promise<{ enableMultiMerchant: boolean }> => {
  const response = await fetch(withBase(config, '/mode'), {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ enableMultiMerchant: enabled }),
  });
  return handleResponse<{ enableMultiMerchant: boolean }>(response);
};

