import { URLSearchParams } from 'node:url';

export type ShopifyCartLine = {
  variantId: string;
  quantity: number;
};

export type ShopifyCartOptions = {
  note?: string;
  extraQuery?: Record<string, string | number | undefined>;
};

const normalizeDomain = (domain: string): string => {
  const trimmed = domain.trim();
  if (!trimmed) {
    throw new Error('Shop domain is required');
  }
  return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
};

const buildQuery = (options?: ShopifyCartOptions): string => {
  if (!options) return '';
  const params = new URLSearchParams();
  if (options.note) {
    params.set('note', options.note);
  }
  if (options.extraQuery) {
    for (const [key, value] of Object.entries(options.extraQuery)) {
      if (value == null) continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
};

export const buildShopifyCartUrl = (
  shopDomain: string,
  items: ReadonlyArray<ShopifyCartLine>,
  options?: ShopifyCartOptions,
): string => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('At least one cart item is required');
  }
  const normalizedDomain = normalizeDomain(shopDomain);
  const parts = items.map((item) => {
    if (!/^\d+$/.test(item.variantId)) {
      throw new Error(`Invalid variant ID "${item.variantId}"`);
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new Error(`Invalid quantity for variant ${item.variantId}`);
    }
    return `${item.variantId}:${item.quantity}`;
  });
  const cartPath = parts.join(',');
  return `https://${normalizedDomain}/cart/${cartPath}${buildQuery(options)}`;
};









