import { z } from 'zod';

export const ProductTypeSchema = z.enum(['one_time', 'subscription']);
export type ProductType = z.infer<typeof ProductTypeSchema>;

export const SubscriptionIntervalSchema = z.enum(['day', 'week', 'month', 'year']);
export type SubscriptionInterval = z.infer<typeof SubscriptionIntervalSchema>;

export const CurrencySchema = z.enum(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY']);
export type Currency = z.infer<typeof CurrencySchema>;

const isoDate = z.string().min(1, 'Timestamp required');

const optionalUrl = z
  .string()
  .trim()
  .url()
  .or(z.string().trim().startsWith('/'))
  .optional();

export const StripeProductSchema = z.object({
  id: z.string().min(1, 'Product id required'),
  name: z.string().min(1, 'Product name required'),
  description: z.string().default(''),
  imageUrl: optionalUrl,
  type: ProductTypeSchema,
  priceAmountCents: z.number().int().min(0, 'Price must be non-negative'),
  currency: CurrencySchema.default('USD'),
  interval: SubscriptionIntervalSchema.nullable().default(null),
  intervalCount: z.number().int().min(1).nullable().default(null),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  metadata: z.record(z.string()).default({}),
  stripeProductId: z.string().optional(),
  stripePriceId: z.string().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const StripeProductsConfigSchema = z.object({
  products: z.array(StripeProductSchema).default([]),
});

export type StripeProduct = z.infer<typeof StripeProductSchema>;
export type StripeProductsConfig = z.infer<typeof StripeProductsConfigSchema>;

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

export type StripeProductPatch = Partial<Omit<StripeProduct, 'id' | 'createdAt' | 'updatedAt'>>;

export const CheckoutSessionRequestSchema = z.object({
  productId: z.string().min(1, 'Product ID required'),
  quantity: z.number().int().min(1).default(1),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
  customerEmail: z.string().email().optional(),
});

export type CheckoutSessionRequest = z.infer<typeof CheckoutSessionRequestSchema>;

export const CheckoutSessionResponseSchema = z.object({
  sessionId: z.string(),
  url: z.string().url(),
});

export type CheckoutSessionResponse = z.infer<typeof CheckoutSessionResponseSchema>;

export const StripeModeSchema = z.enum(['staging', 'production']);
export type StripeMode = z.infer<typeof StripeModeSchema>;

export const StripeConfigSchema = z.object({
  mode: StripeModeSchema,
  publishableKey: z.string().min(1),
  secretKey: z.string().min(1),
  webhookSecret: z.string().optional(),
});

export type StripeConfig = z.infer<typeof StripeConfigSchema>;

export const WebhookEventTypeSchema = z.enum([
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
]);

export type WebhookEventType = z.infer<typeof WebhookEventTypeSchema>;

export const OrderRecordSchema = z.object({
  id: z.string(),
  stripeSessionId: z.string(),
  stripeCustomerId: z.string().optional(),
  productId: z.string(),
  productName: z.string(),
  quantity: z.number().int().min(1),
  amountTotalCents: z.number().int(),
  currency: CurrencySchema,
  customerEmail: z.string().email().optional(),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']),
  type: ProductTypeSchema,
  subscriptionId: z.string().optional(),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export type OrderRecord = z.infer<typeof OrderRecordSchema>;

export const OrdersConfigSchema = z.object({
  orders: z.array(OrderRecordSchema).default([]),
});

export type OrdersConfig = z.infer<typeof OrdersConfigSchema>;

export const formatPrice = (amountCents: number, currency: Currency): string => {
  const amount = amountCents / 100;
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  });
  return formatter.format(amount);
};

export const generateProductId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `prod_${timestamp}${random}`;
};

export const generateOrderId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ord_${timestamp}${random}`;
};

