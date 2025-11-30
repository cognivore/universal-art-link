import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import type { PathConfig } from './paths.js';
import {
  StripeProductsConfigSchema,
  OrdersConfigSchema,
  generateProductId,
  generateOrderId,
  type StripeProduct,
  type StripeProductsConfig,
  type StripeProductInput,
  type StripeProductPatch,
  type OrderRecord,
  type OrdersConfig,
} from '../types/stripe-commerce.js';

const getProductsPath = (paths: PathConfig): string =>
  path.join(paths.contentDir, 'commerce', 'stripe-products.yaml');

const getOrdersPath = (paths: PathConfig): string =>
  path.join(paths.contentDir, 'commerce', 'stripe-orders.yaml');

export const readStripeProducts = async (paths: PathConfig): Promise<StripeProductsConfig> => {
  const filePath = getProductsPath(paths);
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    return { products: [] };
  }
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = YAML.parse(content) as Record<string, unknown> | null;
  // Handle empty YAML or `products: ` with no items (parses as null)
  const normalized = {
    products: (parsed?.products as unknown[]) ?? [],
  };
  return StripeProductsConfigSchema.parse(normalized);
};

const writeStripeProducts = async (paths: PathConfig, config: StripeProductsConfig): Promise<void> => {
  const filePath = getProductsPath(paths);
  await fs.ensureDir(path.dirname(filePath));
  const content = YAML.stringify(config, { lineWidth: 0 });
  await fs.writeFile(filePath, content, 'utf8');
};

export const createStripeProduct = async (
  paths: PathConfig,
  input: StripeProductInput,
): Promise<StripeProduct> => {
  const config = await readStripeProducts(paths);
  const now = new Date().toISOString();
  const product: StripeProduct = {
    id: generateProductId(),
    name: input.name,
    description: input.description ?? '',
    imageUrl: input.imageUrl,
    type: input.type,
    priceAmountCents: input.priceAmountCents,
    currency: input.currency ?? 'USD',
    interval: input.type === 'subscription' ? (input.interval ?? 'month') : null,
    intervalCount: input.type === 'subscription' ? (input.intervalCount ?? 1) : null,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
    metadata: input.metadata ?? {},
    createdAt: now,
    updatedAt: now,
  };
  config.products.push(product);
  await writeStripeProducts(paths, config);
  return product;
};

export const updateStripeProduct = async (
  paths: PathConfig,
  productId: string,
  patch: StripeProductPatch,
): Promise<StripeProduct> => {
  const config = await readStripeProducts(paths);
  const index = config.products.findIndex((p) => p.id === productId);
  if (index === -1) {
    throw new Error(`Product not found: ${productId}`);
  }
  const existing = config.products[index]!;
  const updated: StripeProduct = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  config.products[index] = updated;
  await writeStripeProducts(paths, config);
  return updated;
};

export const deleteStripeProduct = async (paths: PathConfig, productId: string): Promise<void> => {
  const config = await readStripeProducts(paths);
  const index = config.products.findIndex((p) => p.id === productId);
  if (index === -1) {
    throw new Error(`Product not found: ${productId}`);
  }
  config.products.splice(index, 1);
  await writeStripeProducts(paths, config);
};

export const getStripeProduct = async (
  paths: PathConfig,
  productId: string,
): Promise<StripeProduct | null> => {
  const config = await readStripeProducts(paths);
  return config.products.find((p) => p.id === productId) ?? null;
};

export const listActiveStripeProducts = async (paths: PathConfig): Promise<StripeProduct[]> => {
  const config = await readStripeProducts(paths);
  return config.products
    .filter((p) => p.isActive)
    .sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name);
    });
};

// Orders

export const readOrders = async (paths: PathConfig): Promise<OrdersConfig> => {
  const filePath = getOrdersPath(paths);
  const exists = await fs.pathExists(filePath);
  if (!exists) {
    return { orders: [] };
  }
  const content = await fs.readFile(filePath, 'utf8');
  const parsed = YAML.parse(content) as Record<string, unknown> | null;
  // Handle empty YAML or `orders: ` with no items (parses as null)
  const normalized = {
    orders: (parsed?.orders as unknown[]) ?? [],
  };
  return OrdersConfigSchema.parse(normalized);
};

const writeOrders = async (paths: PathConfig, config: OrdersConfig): Promise<void> => {
  const filePath = getOrdersPath(paths);
  await fs.ensureDir(path.dirname(filePath));
  const content = YAML.stringify(config, { lineWidth: 0 });
  await fs.writeFile(filePath, content, 'utf8');
};

export const createOrder = async (
  paths: PathConfig,
  order: Omit<OrderRecord, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<OrderRecord> => {
  const config = await readOrders(paths);
  const now = new Date().toISOString();
  const record: OrderRecord = {
    ...order,
    id: generateOrderId(),
    createdAt: now,
    updatedAt: now,
  };
  config.orders.push(record);
  await writeOrders(paths, config);
  return record;
};

export const updateOrder = async (
  paths: PathConfig,
  orderId: string,
  patch: Partial<Omit<OrderRecord, 'id' | 'createdAt'>>,
): Promise<OrderRecord> => {
  const config = await readOrders(paths);
  const index = config.orders.findIndex((o) => o.id === orderId);
  if (index === -1) {
    throw new Error(`Order not found: ${orderId}`);
  }
  const existing = config.orders[index]!;
  const updated: OrderRecord = {
    ...existing,
    ...patch,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  config.orders[index] = updated;
  await writeOrders(paths, config);
  return updated;
};

export const getOrderBySessionId = async (
  paths: PathConfig,
  sessionId: string,
): Promise<OrderRecord | null> => {
  const config = await readOrders(paths);
  return config.orders.find((o) => o.stripeSessionId === sessionId) ?? null;
};

export const listOrders = async (
  paths: PathConfig,
  options: { limit?: number; status?: OrderRecord['status'] } = {},
): Promise<OrderRecord[]> => {
  const config = await readOrders(paths);
  let orders = [...config.orders];
  if (options.status) {
    orders = orders.filter((o) => o.status === options.status);
  }
  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (options.limit) {
    orders = orders.slice(0, options.limit);
  }
  return orders;
};

