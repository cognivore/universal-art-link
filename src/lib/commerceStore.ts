import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import { randomUUID } from 'node:crypto';
import {
  CatalogConfig,
  CatalogInput,
  CommerceData,
  CommerceDataSchema,
  Merchant,
  MerchantInput,
  MerchantItem,
  MerchantItemInput,
  MerchantItemPatch,
  MerchantPatch,
  SingleShopConfig,
} from '../types/commerce.js';
import { PathConfig } from './paths.js';

export type CommerceSnapshot = CommerceData;
export type MerchantWithItems = Merchant & { items: MerchantItem[] };

const merchantsFile = (paths: PathConfig): string => path.join(paths.commerceDir, 'merchants.yaml');
const catalogFile = (paths: PathConfig): string => path.join(paths.commerceDir, 'catalog.yaml');
const shopFile = (paths: PathConfig): string => path.join(paths.commerceDir, 'shop.yaml');

const ensureDir = async (paths: PathConfig): Promise<void> => {
  await fs.ensureDir(paths.commerceDir);
};

const readYamlIfExists = async <T>(filePath: string, fallback: T): Promise<T> => {
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    return fallback;
  }
  const raw = await fs.readFile(filePath, 'utf8');
  return YAML.parse(raw) ?? fallback;
};

const writeYaml = async (filePath: string, data: unknown): Promise<void> => {
  const payload = YAML.stringify(data ?? {}, { lineWidth: 0 });
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, payload, 'utf8');
};

const slugify = (value: string): string => {
  const base = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `merchant-${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeSlug = (value: string): string => slugify(value).replace(/--+/g, '-');

const normalizeDomain = (value: string): string => {
  const trimmed = value.trim();
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '');
  return withoutProtocol.replace(/\/.*$/, '').toLowerCase();
};

const createId = (prefix: string): string => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;

const now = (): string => new Date().toISOString();

const assertNonEmpty = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }
  return trimmed;
};

const applyMerchantPatch = (merchant: Merchant, patch: MerchantPatch): Merchant => {
  const nextName = patch.name ? assertNonEmpty(patch.name, 'Merchant name') : merchant.name;
  const nextLogo =
    patch.logoUrl === undefined ? merchant.logoUrl : patch.logoUrl.trim() ? patch.logoUrl.trim() : undefined;
  const nextDescription = patch.description ?? merchant.description;
  const next: Merchant = {
    ...merchant,
    ...patch,
    name: nextName,
    shopDomain: patch.shopDomain ? normalizeDomain(assertNonEmpty(patch.shopDomain, 'Shop domain')) : merchant.shopDomain,
    slug: patch.slug ? sanitizeSlug(patch.slug) : merchant.slug,
    description: nextDescription,
    logoUrl: nextLogo,
    isActive: patch.isActive ?? merchant.isActive,
    updatedAt: now(),
  };
  return next;
};

const applyItemPatch = (item: MerchantItem, patch: MerchantItemPatch): MerchantItem => ({
  ...item,
  ...patch,
  description: patch.description ?? item.description,
  imageUrl: patch.imageUrl === undefined ? item.imageUrl : patch.imageUrl.trim() ? patch.imageUrl.trim() : undefined,
  displayPrice: patch.displayPrice === undefined ? item.displayPrice : patch.displayPrice,
  isActive: patch.isActive ?? item.isActive,
  sortOrder: typeof patch.sortOrder === 'number' ? patch.sortOrder : item.sortOrder,
  updatedAt: now(),
});

const sortItems = (items: MerchantItem[]): MerchantItem[] =>
  [...items].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder;
    }
    return a.title.localeCompare(b.title);
  });

const validateSnapshot = (snapshot: unknown): CommerceSnapshot => {
  const parsed = CommerceDataSchema.parse(snapshot);
  return parsed as CommerceSnapshot;
};

export const readCommerceData = async (paths: PathConfig): Promise<CommerceSnapshot> => {
  await ensureDir(paths);
  const [merchantsPayload, catalog, shopConfig] = await Promise.all([
    readYamlIfExists<{ merchants?: Merchant[]; items?: MerchantItem[] }>(merchantsFile(paths), { merchants: [], items: [] }),
    readYamlIfExists<CatalogConfig | undefined>(catalogFile(paths), undefined),
    readYamlIfExists<{ shop?: Record<string, unknown>; enableMultiMerchant?: boolean }>(shopFile(paths), {}),
  ]);
  const snapshot = {
    merchants: merchantsPayload.merchants ?? [],
    items: merchantsPayload.items ?? [],
    catalog: catalog,
    shop: shopConfig.shop,
    enableMultiMerchant: shopConfig.enableMultiMerchant ?? false,
  };
  return validateSnapshot(snapshot);
};

const writeCommerceData = async (paths: PathConfig, snapshot: CommerceSnapshot): Promise<void> => {
  await ensureDir(paths);
  const normalized = validateSnapshot(snapshot);
  await writeYaml(merchantsFile(paths), {
    merchants: normalized.merchants,
    items: normalized.items,
  });
  if (normalized.catalog) {
    await writeYaml(catalogFile(paths), normalized.catalog);
  } else {
    const catalogPath = catalogFile(paths);
    if (await fs.pathExists(catalogPath)) {
      await fs.remove(catalogPath);
    }
  }
};

const assertMerchantExists = (merchants: Merchant[], merchantId: string): Merchant => {
  const merchant = merchants.find((entry) => entry.id === merchantId);
  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }
  return merchant;
};

const ensureSlugUnique = (merchants: Merchant[], slug: string, currentId?: string): string => {
  let candidate = sanitizeSlug(slug);
  const existing = new Set(merchants.filter((m) => m.id !== currentId).map((m) => m.slug));
  let suffix = 1;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `${candidate}-${suffix}`;
  }
  return candidate;
};

export const createMerchant = async (paths: PathConfig, input: MerchantInput): Promise<Merchant> => {
  const snapshot = await readCommerceData(paths);
  const merchantId = input.id ?? createId('mrt');
  const merchantName = assertNonEmpty(input.name, 'Merchant name');
  const slugSource = input.slug ?? merchantName ?? merchantId;
  const slug = ensureSlugUnique(snapshot.merchants, slugSource);
  const timestamp = now();
  const record: Merchant = {
    id: merchantId,
    ownerUserId: input.ownerUserId,
    name: merchantName,
    slug,
    shopDomain: normalizeDomain(assertNonEmpty(input.shopDomain, 'Shop domain')),
    logoUrl: input.logoUrl?.trim() || undefined,
    description: input.description ?? '',
    isActive: input.isActive ?? true,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  snapshot.merchants.push(record);
  await writeCommerceData(paths, snapshot);
  return record;
};

export const updateMerchant = async (paths: PathConfig, merchantId: string, patch: MerchantPatch): Promise<Merchant> => {
  const snapshot = await readCommerceData(paths);
  const index = snapshot.merchants.findIndex((entry) => entry.id === merchantId);
  if (index < 0) {
    throw new Error(`Merchant ${merchantId} not found`);
  }
  const merchant = snapshot.merchants[index];
  if (!merchant) {
    throw new Error(`Merchant ${merchantId} not found`);
  }
  const next = applyMerchantPatch(merchant, {
    ...patch,
    slug: patch.slug ? ensureSlugUnique(snapshot.merchants, patch.slug, merchantId) : patch.slug,
  });
  snapshot.merchants[index] = next;
  await writeCommerceData(paths, snapshot);
  return next;
};

export const deleteMerchant = async (paths: PathConfig, merchantId: string): Promise<void> => {
  const snapshot = await readCommerceData(paths);
  const nextMerchants = snapshot.merchants.filter((entry) => entry.id !== merchantId);
  if (nextMerchants.length === snapshot.merchants.length) {
    throw new Error(`Merchant ${merchantId} not found`);
  }
  const nextItems = snapshot.items.filter((item) => item.merchantId !== merchantId);
  await writeCommerceData(paths, { ...snapshot, merchants: nextMerchants, items: nextItems });
};

const assertVariantId = (value: string): string => {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Shopify variant ID must contain digits only');
  }
  return trimmed;
};

export const createMerchantItem = async (
  paths: PathConfig,
  merchantId: string,
  input: MerchantItemInput,
): Promise<MerchantItem> => {
  const snapshot = await readCommerceData(paths);
  const resolvedMerchantId = input.merchantId ?? merchantId;
  assertMerchantExists(snapshot.merchants, resolvedMerchantId);
  const timestamp = now();
  const existingCount = snapshot.items.filter((item) => item.merchantId === resolvedMerchantId).length;
  const sortOrder = typeof input.sortOrder === 'number' ? input.sortOrder : existingCount;
  const record: MerchantItem = {
    id: input.id ?? createId('itm'),
    merchantId: resolvedMerchantId,
    title: assertNonEmpty(input.title, 'Item title'),
    description: input.description ?? '',
    imageUrl: input.imageUrl?.trim() || undefined,
    shopifyVariantId: assertVariantId(assertNonEmpty(input.shopifyVariantId, 'Shopify variant ID')),
    displayPrice: input.displayPrice,
    isActive: input.isActive ?? true,
    sortOrder,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  snapshot.items.push(record);
  await writeCommerceData(paths, snapshot);
  return record;
};

export const updateMerchantItem = async (
  paths: PathConfig,
  itemId: string,
  patch: MerchantItemPatch,
): Promise<MerchantItem> => {
  const snapshot = await readCommerceData(paths);
  const index = snapshot.items.findIndex((item) => item.id === itemId);
  if (index < 0) {
    throw new Error(`Item ${itemId} not found`);
  }
  const item = snapshot.items[index];
  if (!item) {
    throw new Error(`Item ${itemId} not found`);
  }
  const next = applyItemPatch(item, {
    ...patch,
    shopifyVariantId: patch.shopifyVariantId ? assertVariantId(patch.shopifyVariantId) : undefined,
  });
  snapshot.items[index] = next;
  await writeCommerceData(paths, snapshot);
  return next;
};

export const deleteMerchantItem = async (paths: PathConfig, itemId: string): Promise<void> => {
  const snapshot = await readCommerceData(paths);
  const nextItems = snapshot.items.filter((item) => item.id !== itemId);
  if (nextItems.length === snapshot.items.length) {
    throw new Error(`Item ${itemId} not found`);
  }
  await writeCommerceData(paths, { ...snapshot, items: nextItems });
};

export const saveCatalogConfig = async (paths: PathConfig, config: CatalogInput): Promise<CatalogConfig> => {
  const snapshot = await readCommerceData(paths);
  const next = { ...snapshot, catalog: config };
  await writeCommerceData(paths, next);
  return config;
};

export const listMerchantsWithItems = async (paths: PathConfig): Promise<ReadonlyArray<MerchantWithItems>> => {
  const snapshot = await readCommerceData(paths);
  return snapshot.merchants.map((merchant) => ({
    ...merchant,
    items: sortItems(snapshot.items.filter((item) => item.merchantId === merchant.id)),
  }));
};

export const getMerchantBySlug = async (paths: PathConfig, slug: string): Promise<MerchantWithItems | null> => {
  const normalized = sanitizeSlug(slug);
  const snapshot = await readCommerceData(paths);
  const merchant = snapshot.merchants.find((entry) => entry.slug === normalized);
  if (!merchant) {
    return null;
  }
  return {
    ...merchant,
    items: sortItems(snapshot.items.filter((item) => item.merchantId === merchant.id)),
  };
};

export const getCommerceCatalog = async (paths: PathConfig): Promise<CatalogConfig | undefined> => {
  const snapshot = await readCommerceData(paths);
  return snapshot.catalog;
};

export const getActiveMerchants = async (paths: PathConfig): Promise<Merchant[]> => {
  const snapshot = await readCommerceData(paths);
  return snapshot.merchants.filter((merchant) => merchant.isActive).sort((a, b) => a.name.localeCompare(b.name));
};

export const readShopConfig = async (paths: PathConfig): Promise<SingleShopConfig | null> => {
  const snapshot = await readCommerceData(paths);
  return snapshot.shop ?? null;
};

export const saveShopConfig = async (paths: PathConfig, config: Partial<SingleShopConfig>): Promise<SingleShopConfig> => {
  const snapshot = await readCommerceData(paths);
  const current = snapshot.shop ?? {
    domain: '',
    name: '',
    description: '',
    storefrontAccessToken: '',
    featuredCollection: '',
    cartNote: '',
  };

  const updated: SingleShopConfig = {
    domain: config.domain?.trim() || current.domain,
    name: config.name?.trim() || current.name,
    description: config.description?.trim() || current.description,
    logoUrl: config.logoUrl?.trim() || current.logoUrl,
    storefrontAccessToken: config.storefrontAccessToken?.trim() || current.storefrontAccessToken,
    featuredCollection: config.featuredCollection?.trim() || current.featuredCollection,
    cartNote: config.cartNote?.trim() || current.cartNote,
  };

  const shopData = {
    shop: updated,
    enableMultiMerchant: snapshot.enableMultiMerchant,
  };

  await writeYaml(shopFile(paths), shopData);
  return updated;
};

export const toggleMultiMerchantMode = async (paths: PathConfig, enabled: boolean): Promise<void> => {
  const snapshot = await readCommerceData(paths);
  const shopData = {
    shop: snapshot.shop,
    enableMultiMerchant: enabled,
  };
  await writeYaml(shopFile(paths), shopData);
};

