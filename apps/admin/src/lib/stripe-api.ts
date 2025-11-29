import { getRuntimeConfig } from './runtime-config';

export type ProductType = 'one_time' | 'subscription';
export type SubscriptionInterval = 'day' | 'week' | 'month' | 'year';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'JPY';

export type StripeProduct = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  type: ProductType;
  priceAmountCents: number;
  currency: Currency;
  interval: SubscriptionInterval | null;
  intervalCount: number | null;
  isActive: boolean;
  sortOrder: number;
  metadata: Record<string, string>;
  stripeProductId?: string;
  stripePriceId?: string;
  createdAt: string;
  updatedAt: string;
};

export type StripeProductInput = {
  name: string;
  description?: string;
  imageUrl?: string;
  type: ProductType;
  priceAmountCents: number;
  currency?: Currency;
  interval?: SubscriptionInterval | null;
  intervalCount?: number | null;
  isActive?: boolean;
  sortOrder?: number;
  metadata?: Record<string, string>;
};

export type StripeProductPatch = Partial<StripeProductInput>;

export type OrderRecord = {
  id: string;
  stripeSessionId: string;
  stripeCustomerId?: string;
  productId: string;
  productName: string;
  quantity: number;
  amountTotalCents: number;
  currency: Currency;
  customerEmail?: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  type: ProductType;
  subscriptionId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductsResponse = {
  ok: boolean;
  products: StripeProduct[];
  publishableKey: string;
};

export type OrdersResponse = {
  ok: boolean;
  orders: OrderRecord[];
};

const getApiBase = () => {
  const config = getRuntimeConfig();
  return config.previewBaseUrl;
};

export const fetchProducts = async (): Promise<ProductsResponse> => {
  const response = await fetch(`${getApiBase()}/__ual/api/stripe/products`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to fetch products');
  }

  return response.json();
};

export const createProduct = async (input: StripeProductInput): Promise<StripeProduct> => {
  const response = await fetch(`${getApiBase()}/__ual/api/stripe/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to create product');
  }

  return response.json();
};

export const updateProduct = async (
  productId: string,
  patch: StripeProductPatch
): Promise<StripeProduct> => {
  const response = await fetch(`${getApiBase()}/__ual/api/stripe/products/${productId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to update product');
  }

  return response.json();
};

export const deleteProduct = async (productId: string): Promise<void> => {
  const response = await fetch(`${getApiBase()}/__ual/api/stripe/products/${productId}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to delete product');
  }
};

export const fetchOrders = async (
  options: { limit?: number; status?: OrderRecord['status'] } = {}
): Promise<OrdersResponse> => {
  const params = new URLSearchParams();
  if (options.limit) params.set('limit', String(options.limit));
  if (options.status) params.set('status', options.status);

  const query = params.toString();
  const url = `${getApiBase()}/__ual/api/stripe/orders${query ? `?${query}` : ''}`;

  const response = await fetch(url, { credentials: 'include' });

  if (!response.ok) {
    const data = await response.json();
    throw new Error(data.error || 'Failed to fetch orders');
  }

  return response.json();
};

export const formatPrice = (amountCents: number, currency: Currency): string => {
  const amount = amountCents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
};

