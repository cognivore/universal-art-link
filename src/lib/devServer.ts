import fs from 'fs-extra';
import http from 'node:http';
import path from 'node:path';
import { Logger } from './logger.js';
import { AdminService } from './adminService.js';
import { readContentSnapshot, readSchemaDefinition, writeContentSnapshot } from './contentStore.js';
import type { ContentSnapshot } from './contentStore.js';
import type { CatalogInput, SingleShopConfig } from '../types/commerce.js';
import { PathConfig } from './paths.js';
import {
  createMerchant,
  createMerchantItem,
  deleteMerchant,
  deleteMerchantItem,
  readCommerceData,
  readShopConfig,
  saveCatalogConfig,
  saveShopConfig,
  toggleMultiMerchantMode,
  updateMerchant,
  updateMerchantItem,
} from './commerceStore.js';
import {
  createAuthConfig,
  isAuthorizedEmail,
  generateMagicLinkUrl,
  verifyMagicLinkToken,
  createJwt,
  verifyJwt,
  parseJwtFromCookie,
  createSessionCookie,
  createLogoutCookie,
  getClientIp,
  checkIpMismatch,
  verifyStagingBypassJwt,
  isStagingBypassEnabled,
  type AuthConfig,
  type JwtPayload,
} from './auth.js';
import { createAuthGuard, type AuthenticatedRequest } from './authMiddleware.js';
import { createStripeConfig, getStripePublicConfig, validateStripeConfig } from './stripeConfig.js';
import { createStripeService, type StripeService } from './stripeService.js';
import {
  readStripeProducts,
  createStripeProduct,
  updateStripeProduct,
  deleteStripeProduct,
  getStripeProduct,
  createOrder,
  updateOrder,
  getOrderBySessionId,
  listOrders,
} from './stripeProductStore.js';
import {
  CheckoutSessionRequestSchema,
  type StripeMode,
  type StripeProductInput,
  type StripeProductPatch,
} from '../types/stripe-commerce.js';

const mimeMap: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};

type LiveReloadClient = http.ServerResponse<http.IncomingMessage>;

export type AdminRuntimeConfig = {
  readonly previewBaseUrl: string;
  readonly previewHealthPath: string;
  readonly apiBaseUrl: string;
  readonly adminBaseUrl: string;
  readonly strapiUrl: string;
  readonly previewPaths: ReadonlyArray<string>;
  readonly singleTenantStripe?: boolean;
  readonly stripeMode?: StripeMode;
  readonly stripePublishableKey?: string;
};

export type StripeServerConfig = {
  readonly enabled: boolean;
  readonly mode: StripeMode;
};

type DevServerOptions = {
  readonly distDir: string;
  readonly adminAssetsDir?: string;
  readonly port: number;
  readonly logger: Logger;
  readonly adminService: AdminService;
  readonly paths: PathConfig;
  readonly runtimeConfig: AdminRuntimeConfig;
  readonly stripeConfig?: StripeServerConfig;
};

export type DevServer = {
  readonly notifyReload: () => void;
  readonly close: () => Promise<void>;
  readonly updateRuntimeConfig: (patch: Partial<AdminRuntimeConfig>) => void;
};

const injectLiveReload = (html: string): string => {
  const snippet = `
    <script>
      (() => {
        console.log('[UAL] Initializing live reload client');
        let source = null;
        let reconnectAttempts = 0;
        const maxReconnects = 3;

        const connect = () => {
          if (source) {
            console.log('[UAL] Closing existing EventSource before reconnect');
            source.close();
          }

          console.log('[UAL] Connecting to live reload server (attempt ' + (reconnectAttempts + 1) + ')');
          source = new EventSource('/__ual/live');

          source.addEventListener('open', () => {
            console.log('[UAL] Live reload connected');
            reconnectAttempts = 0;
          });

          source.addEventListener('message', (event) => {
            console.log('[UAL] Received reload signal');
            if (event.data === 'reload') {
              window.location.reload();
            }
          });

          source.addEventListener('error', (error) => {
            console.log('[UAL] EventSource error, closing connection');
            source.close();
            if (reconnectAttempts < maxReconnects) {
              reconnectAttempts++;
              console.log('[UAL] Will retry connection in 2 seconds');
              setTimeout(connect, 2000);
            } else {
              console.log('[UAL] Max reconnection attempts reached');
            }
          });
        };

        connect();

        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
          console.log('[UAL] Page unloading, closing live reload connection');
          if (source) {
            source.close();
            source = null;
          }
        });

        // Cleanup on visibility change (tab switching)
        document.addEventListener('visibilitychange', () => {
          if (document.hidden && source) {
            console.log('[UAL] Tab hidden, closing live reload connection');
            source.close();
            source = null;
          } else if (!document.hidden && !source) {
            console.log('[UAL] Tab visible, reconnecting live reload');
            reconnectAttempts = 0;
            connect();
          }
        });
      })();
    </script>
  `;
  if (html.includes('</body>')) {
    return html.replace('</body>', `${snippet}</body>`);
  }
  return `${html}${snippet}`;
};

const injectRuntimeConfig = (html: string, runtime: AdminRuntimeConfig): string => {
  const script = `<script>window.__UAL_RUNTIME__ = ${JSON.stringify(runtime)};</script>`;
  if (html.includes('</head>')) {
    return html.replace('</head>', `${script}</head>`);
  }
  return `${script}${html}`;
};

const respondJson = (res: http.ServerResponse<http.IncomingMessage>, status: number, payload: unknown): void => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readJsonBody = async (req: http.IncomingMessage): Promise<Record<string, unknown>> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 1 * 1024 * 1024;
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        resolve(parsed);
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });

const DEFAULT_OWNER_ID = 'local-admin';

const readRawBody = async (req: http.IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const maxBytes = 1 * 1024 * 1024;
    req.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const handleAuthApi = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  paths: PathConfig,
  authConfig: AuthConfig,
  requestUrl: URL,
  logger: Logger,
): Promise<boolean> => {
  if (!requestUrl.pathname.startsWith('/__ual/auth')) {
    return false;
  }

  const method = req.method ?? 'GET';

  // Extract client IP for tracking
  const clientIp = getClientIp(
    req.headers as Record<string, string | string[] | undefined>,
    req.socket.remoteAddress,
  );

  try {
    // POST /__ual/auth/request-link - Send magic link email
    if (requestUrl.pathname === '/__ual/auth/request-link' && method === 'POST') {
      const body = await readJsonBody(req);
      const email = String(body.email ?? '').toLowerCase().trim();

      if (!email) {
        respondJson(res, 400, { error: 'Email is required' });
        return true;
      }

      const admin = await isAuthorizedEmail(email, paths.contentDir);
      if (!admin) {
        // Don't reveal if email exists or not - just say we sent it
        logger.info(`[auth] Magic link requested for unauthorized email: ${email} (IP: ${clientIp})`);
        respondJson(res, 200, { message: 'If that email is authorized, a magic link has been sent' });
        return true;
      }

      // Generate magic link with IP tracking
      const magicLinkUrl = generateMagicLinkUrl(email, authConfig, clientIp);
      // In production, you would send this via email
      // For now, log it for development
      logger.info(`[auth] Magic link for ${email} (IP: ${clientIp}): ${magicLinkUrl}`);

      respondJson(res, 200, {
        message: 'If that email is authorized, a magic link has been sent',
        // Include URL in response only in development mode for testing
        _devMagicLink: magicLinkUrl,
      });
      return true;
    }

    // GET /__ual/auth/verify - Verify magic link and issue JWT
    if (requestUrl.pathname === '/__ual/auth/verify' && method === 'GET') {
      const token = requestUrl.searchParams.get('token');
      if (!token) {
        respondJson(res, 400, { error: 'Token is required' });
        return true;
      }

      const decoded = verifyMagicLinkToken(token, authConfig);
      if (!decoded) {
        respondJson(res, 401, { error: 'Invalid or expired token' });
        return true;
      }

      // Check IP mismatch and log warning (but don't block)
      const ipCheck = checkIpMismatch(decoded.requestIp, clientIp);
      if (ipCheck.mismatch) {
        logger.warn(`[auth] IP MISMATCH: ${ipCheck.message}`);
      }

      const admin = await isAuthorizedEmail(decoded.email, paths.contentDir);
      if (!admin) {
        respondJson(res, 401, { error: 'Email not authorized' });
        return true;
      }

      // Create JWT with IP tracking
      const jwt = createJwt(admin, authConfig, {
        requestIp: decoded.requestIp,
        verifyIp: clientIp,
      });
      const cookie = createSessionCookie(jwt, authConfig.jwtTtlSeconds);

      res.setHeader('Set-Cookie', cookie);
      // Redirect to admin panel
      res.statusCode = 302;
      res.setHeader('Location', '/admin');
      res.end();
      return true;
    }

    // GET /__ual/auth/session - Check current session
    if (requestUrl.pathname === '/__ual/auth/session' && method === 'GET') {
      const cookieHeader = req.headers.cookie;
      const token = parseJwtFromCookie(cookieHeader);

      if (!token) {
        respondJson(res, 200, { authenticated: false });
        return true;
      }

      // Try normal JWT verification first
      let payload = verifyJwt(token, authConfig);

      // If normal verification fails and staging bypass is enabled, try staging bypass
      if (!payload && isStagingBypassEnabled()) {
        payload = verifyStagingBypassJwt(token, authConfig);
        if (payload) {
          logger.info(`[auth] Staging bypass JWT used (is_santa=true) 🎅`);
        }
      }

      if (!payload) {
        respondJson(res, 200, { authenticated: false });
        return true;
      }

      respondJson(res, 200, {
        authenticated: true,
        user: { email: payload.sub, name: payload.name },
        expiresAt: payload.exp * 1000,
        isSanta: payload.is_santa ?? false,
      });
      return true;
    }

    // POST /__ual/auth/logout - Clear session
    if (requestUrl.pathname === '/__ual/auth/logout' && method === 'POST') {
      res.setHeader('Set-Cookie', createLogoutCookie());
      respondJson(res, 200, { message: 'Logged out' });
      return true;
    }

    respondJson(res, 404, { error: 'Unknown auth endpoint' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Auth request failed';
    logger.error('[auth] Error:', error);
    respondJson(res, 500, { error: message });
    return true;
  }
};

const handleStripeApi = async (
  req: AuthenticatedRequest,
  res: http.ServerResponse<http.IncomingMessage>,
  paths: PathConfig,
  stripeService: StripeService,
  requestUrl: URL,
  baseUrl: string,
  logger: Logger,
): Promise<boolean> => {
  if (!requestUrl.pathname.startsWith('/__ual/api/stripe')) {
    return false;
  }

  const subPath = requestUrl.pathname.replace('/__ual/api/stripe', '').replace(/^\/+/, '');
  const segments = subPath ? subPath.split('/').filter(Boolean) : [];
  const method = req.method ?? 'GET';

  try {
    // GET /__ual/api/stripe/products - List all products
    if (segments.length === 0 || (segments[0] === 'products' && segments.length === 1 && method === 'GET')) {
      const config = await readStripeProducts(paths);
      respondJson(res, 200, {
        ok: true,
        products: config.products,
        publishableKey: stripeService.getPublishableKey(),
      });
      return true;
    }

    // POST /__ual/api/stripe/products - Create product (requires auth)
    if (segments[0] === 'products' && segments.length === 1 && method === 'POST') {
      if (!req.user) {
        respondJson(res, 401, { error: 'Authentication required' });
        return true;
      }
      const body = await readJsonBody(req);
      const input: StripeProductInput = {
        name: String(body.name ?? ''),
        description: body.description ? String(body.description) : undefined,
        imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
        type: body.type === 'subscription' ? 'subscription' : 'one_time',
        priceAmountCents: Number(body.priceAmountCents ?? 0),
        currency: body.currency ? String(body.currency) as 'USD' : 'USD',
        interval: body.interval ? String(body.interval) as 'month' : null,
        intervalCount: body.intervalCount ? Number(body.intervalCount) : null,
        isActive: body.isActive !== false,
        sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
        metadata: body.metadata as Record<string, string> | undefined,
      };
      const product = await createStripeProduct(paths, input);
      respondJson(res, 201, product);
      return true;
    }

    // PATCH/DELETE /__ual/api/stripe/products/:id - Update/delete product (requires auth)
    if (segments[0] === 'products' && segments.length === 2) {
      const productId = segments[1]!;

      if (method === 'GET') {
        const product = await getStripeProduct(paths, productId);
        if (!product) {
          respondJson(res, 404, { error: 'Product not found' });
          return true;
        }
        respondJson(res, 200, product);
        return true;
      }

      if (!req.user) {
        respondJson(res, 401, { error: 'Authentication required' });
        return true;
      }

      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const patch: StripeProductPatch = {
          name: body.name ? String(body.name) : undefined,
          description: body.description !== undefined ? String(body.description) : undefined,
          imageUrl: body.imageUrl !== undefined ? String(body.imageUrl) : undefined,
          type: body.type ? (body.type === 'subscription' ? 'subscription' : 'one_time') : undefined,
          priceAmountCents: body.priceAmountCents !== undefined ? Number(body.priceAmountCents) : undefined,
          currency: body.currency ? String(body.currency) as 'USD' : undefined,
          interval: body.interval !== undefined ? (body.interval ? String(body.interval) as 'month' : null) : undefined,
          intervalCount: body.intervalCount !== undefined ? (body.intervalCount ? Number(body.intervalCount) : null) : undefined,
          isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
          sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : undefined,
          metadata: body.metadata as Record<string, string> | undefined,
        };
        const product = await updateStripeProduct(paths, productId, patch);
        respondJson(res, 200, product);
        return true;
      }

      if (method === 'DELETE') {
        await deleteStripeProduct(paths, productId);
        res.statusCode = 204;
        res.end();
        return true;
      }
    }

    // POST /__ual/api/stripe/checkout - Create checkout session (public)
    if (segments[0] === 'checkout' && method === 'POST') {
      const body = await readJsonBody(req);
      const parsed = CheckoutSessionRequestSchema.safeParse(body);
      if (!parsed.success) {
        respondJson(res, 400, { error: 'Invalid request', details: parsed.error.issues });
        return true;
      }

      const product = await getStripeProduct(paths, parsed.data.productId);
      if (!product) {
        respondJson(res, 404, { error: 'Product not found' });
        return true;
      }
      if (!product.isActive) {
        respondJson(res, 400, { error: 'Product is not available' });
        return true;
      }

      const successUrl = parsed.data.successUrl ?? `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = parsed.data.cancelUrl ?? `${baseUrl}/shop`;

      const session = await stripeService.createCheckoutSession(product, parsed.data, {
        success: successUrl,
        cancel: cancelUrl,
      });

      // Create pending order record
      await createOrder(paths, {
        stripeSessionId: session.sessionId,
        productId: product.id,
        productName: product.name,
        quantity: parsed.data.quantity,
        amountTotalCents: product.priceAmountCents * parsed.data.quantity,
        currency: product.currency,
        customerEmail: parsed.data.customerEmail,
        status: 'pending',
        type: product.type,
      });

      respondJson(res, 200, session);
      return true;
    }

    // POST /__ual/api/stripe/webhook - Handle Stripe webhooks
    if (segments[0] === 'webhook' && method === 'POST') {
      const signature = req.headers['stripe-signature'];
      if (!signature || typeof signature !== 'string') {
        respondJson(res, 400, { error: 'Missing stripe-signature header' });
        return true;
      }

      const rawBody = await readRawBody(req);

      try {
        const event = stripeService.constructWebhookEvent(rawBody, signature);
        logger.info(`[stripe] Webhook event: ${event.type}`);

        switch (event.type) {
          case 'checkout.session.completed': {
            const session = event.data.object;
            const order = await getOrderBySessionId(paths, session.id);
            if (order) {
              await updateOrder(paths, order.id, {
                status: 'completed',
                stripeCustomerId: session.customer as string | undefined,
                subscriptionId: session.subscription as string | undefined,
              });
              logger.info(`[stripe] Order ${order.id} completed`);
            }
            break;
          }
          case 'checkout.session.expired': {
            const session = event.data.object;
            const order = await getOrderBySessionId(paths, session.id);
            if (order) {
              await updateOrder(paths, order.id, { status: 'failed' });
              logger.info(`[stripe] Order ${order.id} expired`);
            }
            break;
          }
        }

        respondJson(res, 200, { received: true });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook verification failed';
        logger.error('[stripe] Webhook error:', error);
        respondJson(res, 400, { error: message });
        return true;
      }
    }

    // GET /__ual/api/stripe/orders - List orders (requires auth)
    if (segments[0] === 'orders' && segments.length === 1 && method === 'GET') {
      if (!req.user) {
        respondJson(res, 401, { error: 'Authentication required' });
        return true;
      }
      const limit = requestUrl.searchParams.get('limit');
      const status = requestUrl.searchParams.get('status');
      const orders = await listOrders(paths, {
        limit: limit ? Number(limit) : undefined,
        status: status as 'pending' | 'completed' | 'failed' | 'refunded' | undefined,
      });
      respondJson(res, 200, { ok: true, orders });
      return true;
    }

    // GET /__ual/api/stripe/config - Get public Stripe config
    if (segments[0] === 'config' && method === 'GET') {
      respondJson(res, 200, {
        publishableKey: stripeService.getPublishableKey(),
      });
      return true;
    }

    respondJson(res, 404, { error: 'Unknown Stripe endpoint' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Stripe request failed';
    logger.error('[stripe] Error:', error);
    respondJson(res, 500, { error: message });
    return true;
  }
};

const handleCommerceApi = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  paths: PathConfig,
  requestUrl: URL,
): Promise<boolean> => {
  if (!requestUrl.pathname.startsWith('/__ual/api/commerce')) {
    return false;
  }

  const subPath = requestUrl.pathname.replace('/__ual/api/commerce', '').replace(/^\/+/, '');
  const segments = subPath ? subPath.split('/').filter(Boolean) : [];
  const method = req.method ?? 'GET';

  try {
    if (segments.length === 0 && method === 'GET') {
      const snapshot = await readCommerceData(paths);
      respondJson(res, 200, { ok: true, ...snapshot });
      return true;
    }

    if (segments[0] === 'merchants') {
      if (segments.length === 1 && method === 'POST') {
        const body = await readJsonBody(req);
        const merchant = await createMerchant(paths, {
          name: String(body.name ?? ''),
          slug: body.slug ? String(body.slug) : undefined,
          shopDomain: String(body.shopDomain ?? ''),
          logoUrl: body.logoUrl ? String(body.logoUrl) : undefined,
          description: body.description ? String(body.description) : undefined,
          isActive: body.isActive === undefined ? true : Boolean(body.isActive),
          ownerUserId: body.ownerUserId ? String(body.ownerUserId) : DEFAULT_OWNER_ID,
        });
        respondJson(res, 201, merchant);
        return true;
      }

      if (segments.length === 2) {
        const merchantId = segments[1]!;
        if (method === 'PATCH') {
          const body = await readJsonBody(req);
          const merchant = await updateMerchant(paths, merchantId, {
            name: body.name ? String(body.name) : undefined,
            slug: body.slug ? String(body.slug) : undefined,
            shopDomain: body.shopDomain ? String(body.shopDomain) : undefined,
            description: body.description ? String(body.description) : undefined,
            logoUrl: body.logoUrl ? String(body.logoUrl) : undefined,
            isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
          });
          respondJson(res, 200, merchant);
          return true;
        }
        if (method === 'DELETE') {
          await deleteMerchant(paths, merchantId);
          res.statusCode = 204;
          res.end();
          return true;
        }
      }

      if (segments.length === 3 && segments[2] === 'items' && method === 'POST') {
        const merchantId = segments[1]!;
        const body = await readJsonBody(req);
        const item = await createMerchantItem(paths, merchantId, {
          merchantId,
          title: String(body.title ?? ''),
          description: body.description ? String(body.description) : undefined,
          imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
          shopifyVariantId: String(body.shopifyVariantId ?? ''),
          displayPrice: body.displayPrice ? String(body.displayPrice) : undefined,
          isActive: body.isActive === undefined ? true : Boolean(body.isActive),
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
        });
        respondJson(res, 201, item);
        return true;
      }
    }

    if (segments[0] === 'items' && segments.length === 2) {
      const itemId = segments[1]!;
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        const item = await updateMerchantItem(paths, itemId, {
          title: body.title ? String(body.title) : undefined,
          description: body.description ? String(body.description) : undefined,
          imageUrl: body.imageUrl ? String(body.imageUrl) : undefined,
          shopifyVariantId: body.shopifyVariantId ? String(body.shopifyVariantId) : undefined,
          displayPrice: body.displayPrice ? String(body.displayPrice) : undefined,
          isActive: body.isActive === undefined ? undefined : Boolean(body.isActive),
          sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
        });
        respondJson(res, 200, item);
        return true;
      }
      if (method === 'DELETE') {
        await deleteMerchantItem(paths, itemId);
        res.statusCode = 204;
        res.end();
        return true;
      }
    }

    if (segments[0] === 'catalog' && method === 'POST') {
      const body = await readJsonBody(req);
      const catalog = await saveCatalogConfig(paths, body as CatalogInput);
      respondJson(res, 200, catalog);
      return true;
    }

    if (segments[0] === 'shop') {
      if (method === 'GET') {
        const shop = await readShopConfig(paths);
        respondJson(res, 200, shop ?? {});
        return true;
      }
      if (method === 'POST') {
        const body = await readJsonBody(req);
        const shop = await saveShopConfig(paths, body as Partial<SingleShopConfig>);
        respondJson(res, 200, shop);
        return true;
      }
    }

    if (segments[0] === 'mode' && method === 'POST') {
      const body = await readJsonBody(req);
      const enabled = Boolean(body.enableMultiMerchant);
      await toggleMultiMerchantMode(paths, enabled);
      respondJson(res, 200, { enableMultiMerchant: enabled });
      return true;
    }

    respondJson(res, 404, { message: 'Unknown commerce endpoint' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Commerce request failed';
    respondJson(res, 400, { message });
    return true;
  }
};
const handleAdminApi = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  adminService: AdminService,
  paths: PathConfig,
): Promise<boolean> => {
  const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/__ual/api')) {
    return false;
  }

  try {
    if (requestUrl.pathname.startsWith('/__ual/api/commerce')) {
      const handled = await handleCommerceApi(req, res, paths, requestUrl);
      if (handled) {
        return true;
      }
    }

    if (requestUrl.pathname === '/__ual/api/state' && req.method === 'GET') {
      const state = await adminService.getState();
      respondJson(res, 200, { apiAvailable: true, ...state });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/connect' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const connection = await adminService.connect({
        baseUrl: String(body.baseUrl ?? ''),
        secret: String(body.secret ?? ''),
      });
      respondJson(res, 200, { connection });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/content' && req.method === 'GET') {
      const [schema, content] = await Promise.all([readSchemaDefinition(paths), readContentSnapshot(paths)]);
      respondJson(res, 200, { ok: true, schema, content });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/content' && req.method === 'POST') {
      const body = (await readJsonBody(req)) as ContentSnapshot;
      await writeContentSnapshot(paths, body);
      respondJson(res, 200, { ok: true });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/disconnect' && req.method === 'POST') {
      await adminService.disconnect();
      respondJson(res, 200, { status: 'disconnected' });
      return true;
    }

    if (requestUrl.pathname === '/__ual/api/deploy' && req.method === 'POST') {
      const result = await adminService.deploy();
      respondJson(res, 200, { status: 'success', ...result });
      return true;
    }

    respondJson(res, 404, { message: 'Unknown admin endpoint' });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';
    respondJson(res, 400, { message });
    return true;
  }
};

type StaticOptions = {
  readonly adminAssetsDir?: string;
  readonly runtimeConfig: AdminRuntimeConfig;
};

const serveStatic = async (
  req: http.IncomingMessage,
  res: http.ServerResponse<http.IncomingMessage>,
  distDir: string,
  options: StaticOptions,
): Promise<void> => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const decoded = decodeURIComponent(url.pathname);
  const isAdminRequest = decoded === '/admin' || decoded.startsWith('/admin/');
  const useAlternateRoot = Boolean(isAdminRequest && options.adminAssetsDir);
  const assetRoot = useAlternateRoot ? options.adminAssetsDir ?? distDir : distDir;
  const relativePath = useAlternateRoot ? decoded.replace('/admin', '') || '/' : decoded;
  const normalized = relativePath === '/' ? '/index.html' : relativePath;
  let filePath = path.join(assetRoot, normalized);

  const exists = await fs.pathExists(filePath);
  if (!exists) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }

  const stats = await fs.stat(filePath);
  if (stats.isDirectory()) {
    const indexPath = path.join(filePath, 'index.html');
    const hasIndex = await fs.pathExists(indexPath);
    if (!hasIndex) {
      res.statusCode = 403;
      res.end('Directory listing not allowed');
      return;
    }
    filePath = indexPath;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', mimeMap[ext] ?? 'application/octet-stream');

  if (ext === '.html') {
    let html = await fs.readFile(filePath, 'utf8');
    if (!isAdminRequest) {
      html = injectLiveReload(html);
    }
    if (isAdminRequest) {
      html = injectRuntimeConfig(html, options.runtimeConfig);
    }
    res.end(html);
    return;
  }

  const stream = fs.createReadStream(filePath);
  stream.on('error', (error) => {
    res.statusCode = 500;
    res.end(error instanceof Error ? error.message : 'File stream failed');
  });
  stream.pipe(res);
};

export const startDevServer = ({
  distDir,
  adminAssetsDir,
  port,
  logger,
  adminService,
  paths,
  runtimeConfig,
  stripeConfig,
}: DevServerOptions): DevServer => {
  const clients = new Set<LiveReloadClient>();
  const runtimeState: AdminRuntimeConfig = { ...runtimeConfig };

  // Initialize auth and stripe services if single-tenant-stripe mode is enabled
  const isStripeMode = stripeConfig?.enabled ?? false;
  const baseUrl = runtimeConfig.previewBaseUrl;

  let authConfig: AuthConfig | null = null;
  let stripeService: StripeService | null = null;
  let authGuard: ((req: AuthenticatedRequest, res: http.ServerResponse, pathname: string) => boolean) | null = null;

  if (isStripeMode) {
    logger.info(`[devserver] Single-tenant Stripe mode enabled (${stripeConfig!.mode})`);

    authConfig = createAuthConfig({ baseUrl });
    authGuard = createAuthGuard(authConfig);

    try {
      const stripeApiConfig = createStripeConfig(stripeConfig!.mode);
      validateStripeConfig(stripeApiConfig);
      stripeService = createStripeService(stripeApiConfig);

      // Update runtime config with Stripe info
      Object.assign(runtimeState, {
        singleTenantStripe: true,
        stripeMode: stripeConfig!.mode,
        stripePublishableKey: getStripePublicConfig(stripeApiConfig).publishableKey,
      });

      logger.info(`[devserver] Stripe service initialized (${stripeConfig!.mode} mode)`);
    } catch (error) {
      logger.error('[devserver] Failed to initialize Stripe:', error);
      throw error;
    }
  }

  const server = http.createServer(async (req: AuthenticatedRequest, res) => {
    const requestUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const requestMethod = req.method ?? 'GET';
    const requestPath = requestUrl.pathname;

    logger.info(`[devserver] ${requestMethod} ${requestPath}`);

    if (requestUrl.pathname === '/__ual/healthz') {
      logger.info('[devserver] Health check');
      respondJson(res, 200, { ok: true, ts: Date.now(), stripeMode: isStripeMode });
      return;
    }

    if (requestUrl.pathname === '/__ual/runtime' && req.method === 'GET') {
      logger.info('[devserver] Runtime config requested');
      respondJson(res, 200, runtimeState);
      return;
    }

    if ((req.url ?? '').startsWith('/__ual/live')) {
      const clientId = `${req.socket.remoteAddress}:${req.socket.remotePort}`;
      logger.info(`[devserver] Live reload client connected (id: ${clientId}, total: ${clients.size + 1})`);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        Connection: 'keep-alive',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      });
      res.write(': keepalive\n\n');
      clients.add(res);

      // Send keepalive heartbeat every 30 seconds
      const heartbeat = setInterval(() => {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n');
        }
      }, 30000);

      req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
        logger.info(`[devserver] Live reload client disconnected (id: ${clientId}, remaining: ${clients.size})`);
      });

      req.on('error', (error) => {
        clearInterval(heartbeat);
        clients.delete(res);
        logger.error(`[devserver] Live reload client error (id: ${clientId})`, error);
      });

      return;
    }

    // Handle auth endpoints (only in Stripe mode)
    if (isStripeMode && authConfig && requestUrl.pathname.startsWith('/__ual/auth')) {
      try {
        const handled = await handleAuthApi(req, res, paths, authConfig, requestUrl, logger);
        if (handled) {
          return;
        }
      } catch (error) {
        logger.error('Auth API failed', error);
        respondJson(res, 500, { message: 'Auth API error' });
        return;
      }
    }

    // Apply auth guard for protected routes in Stripe mode
    if (isStripeMode && authGuard && authConfig) {
      const allowed = authGuard(req, res, requestPath);
      if (!allowed) {
        // Response already sent by authGuard
        return;
      }
    }

    // Handle Stripe API endpoints (only in Stripe mode)
    if (isStripeMode && stripeService && requestUrl.pathname.startsWith('/__ual/api/stripe')) {
      logger.info(`[devserver] Stripe API: ${requestMethod} ${requestPath}`);
      try {
        const handled = await handleStripeApi(req, res, paths, stripeService, requestUrl, baseUrl, logger);
        if (handled) {
          return;
        }
      } catch (error) {
        logger.error('Stripe API failed', error);
        respondJson(res, 500, { message: 'Stripe API error' });
        return;
      }
    }

    if (requestUrl.pathname.startsWith('/__ual/api')) {
      logger.info(`[devserver] Admin API: ${requestMethod} ${requestPath}`);
      try {
        const handled = await handleAdminApi(req, res, adminService, paths);
        if (handled) {
          return;
        }
      } catch (error) {
        logger.error('Admin API failed', error);
        respondJson(res, 500, { message: 'Admin API error' });
        return;
      }
    }

    try {
      logger.info(`[devserver] Serving static: ${requestPath} from ${distDir}`);
      await serveStatic(req, res, distDir, { adminAssetsDir, runtimeConfig: runtimeState });
    } catch (error) {
      logger.error('Error serving request', error);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });

  server.listen(port, () => {
    logger.info(`[devserver] HTTP server listening on http://localhost:${port}`);
    logger.info(`[devserver] Serving from: ${distDir}`);
    logger.info(`[devserver] Admin assets: ${adminAssetsDir ?? 'none'}`);
  });

  const notifyReload = (): void => {
    logger.info(`[devserver] Notifying ${clients.size} client(s) to reload`);
    for (const client of clients) {
      try {
        client.write('data: reload\n\n');
      } catch (error) {
        logger.error('[devserver] Failed to notify client', error);
      }
    }
  };

  const close = async (): Promise<void> =>
    new Promise((resolve, reject) => {
      logger.info('[devserver] Closing HTTP server...');
      server.close((error) => {
        if (error) {
          logger.error('[devserver] Error closing HTTP server', error);
          reject(error);
        } else {
          logger.info('[devserver] HTTP server closed successfully');
          resolve();
        }
      });
    });

  const updateRuntimeConfig = (patch: Partial<AdminRuntimeConfig>): void => {
    Object.assign(runtimeState, patch);
  };

  return { notifyReload, close, updateRuntimeConfig };
};

