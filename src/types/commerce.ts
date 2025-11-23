import { z } from 'zod';

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const variantRegex = /^\d+$/;

const isoDate = z.string().min(1, 'Timestamp required');

const optionalUrl = z
  .string()
  .trim()
  .url()
  .or(z.string().trim().min(1))
  .optional();

export const MerchantSchema = z.object({
  id: z.string().min(1, 'Merchant id required'),
  ownerUserId: z.string().min(1).optional(),
  name: z.string().min(1, 'Merchant name required'),
  slug: z
    .string()
    .min(1, 'Slug required')
    .regex(slugRegex, 'Slugs may only include lowercase letters, numbers, and hyphens'),
  shopDomain: z
    .string()
    .min(1, 'Shop domain required')
    .regex(/^[^\s]+$/, 'Shop domain cannot contain spaces'),
  logoUrl: optionalUrl,
  description: z.string().default(''),
  isActive: z.boolean().default(true),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const MerchantItemSchema = z.object({
  id: z.string().min(1, 'Item id required'),
  merchantId: z.string().min(1, 'Merchant id required'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().default(''),
  imageUrl: optionalUrl,
  shopifyVariantId: z
    .string()
    .min(1, 'Variant ID required')
    .regex(variantRegex, 'Variant ID must contain digits only'),
  displayPrice: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export const CatalogHeroSchema = z.object({
  title: z.string().default(''),
  body: z.string().default(''),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
});

export const CatalogEmptyStateSchema = z.object({
  title: z.string().default(''),
  body: z.string().default(''),
});

export const CatalogConfigSchema = z.object({
  hero: CatalogHeroSchema.optional(),
  emptyState: CatalogEmptyStateSchema.optional(),
});

export const CommerceDataSchema = z.object({
  merchants: z.array(MerchantSchema).default([]),
  items: z.array(MerchantItemSchema).default([]),
  catalog: CatalogConfigSchema.optional(),
});

export const CartLineItemSchema = z.object({
  merchantId: z.string().min(1),
  merchantItemId: z.string().min(1),
  shopifyVariantId: z.string().regex(variantRegex),
  quantity: z.number().int().min(1),
});

export const CartSchema = z.object({
  id: z.string().min(1),
  userId: z.string().optional(),
  token: z.string().optional(),
  items: z.array(CartLineItemSchema),
  createdAt: isoDate,
  updatedAt: isoDate,
});

export type Merchant = z.infer<typeof MerchantSchema>;
export type MerchantItem = z.infer<typeof MerchantItemSchema>;
export type CatalogHero = z.infer<typeof CatalogHeroSchema>;
export type CatalogEmptyState = z.infer<typeof CatalogEmptyStateSchema>;
export type CatalogConfig = z.infer<typeof CatalogConfigSchema>;
export type CommerceData = z.infer<typeof CommerceDataSchema>;
export type CartLineItem = z.infer<typeof CartLineItemSchema>;
export type Cart = z.infer<typeof CartSchema>;

export type MerchantInput = {
  id?: string;
  ownerUserId?: string;
  name: string;
  slug?: string;
  shopDomain: string;
  logoUrl?: string;
  description?: string;
  isActive?: boolean;
};

export type MerchantPatch = Partial<Omit<Merchant, 'id' | 'createdAt' | 'updatedAt' | 'ownerUserId'>>;

export type MerchantItemInput = {
  id?: string;
  merchantId?: string;
  title: string;
  description?: string;
  imageUrl?: string;
  shopifyVariantId: string;
  displayPrice?: string;
  isActive?: boolean;
  sortOrder?: number;
};

export type MerchantItemPatch = Partial<Omit<MerchantItem, 'id' | 'merchantId' | 'createdAt' | 'updatedAt'>>;

export type CatalogInput = CatalogConfig;

