import type http from 'node:http';
import {
  verifyJwt,
  parseJwtFromCookie,
  verifyStagingBypassJwt,
  isStagingBypassEnabled,
  type AuthConfig,
  type JwtPayload,
} from './auth.js';

export type AuthenticatedRequest = http.IncomingMessage & {
  user?: JwtPayload;
};

export type AuthMiddlewareOptions = {
  readonly authConfig: AuthConfig;
  readonly requireAuth: boolean;
  readonly publicPaths?: ReadonlyArray<string>;
};

export const isPublicPath = (pathname: string, publicPaths: ReadonlyArray<string>): boolean => {
  for (const pattern of publicPaths) {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (pathname.startsWith(prefix)) {
        return true;
      }
    } else if (pathname === pattern) {
      return true;
    }
  }
  return false;
};

/**
 * Extract JWT token from request.
 * Checks both Authorization header (Bearer token) and cookies.
 */
const extractToken = (req: http.IncomingMessage): string | null => {
  // First check Authorization header (for API/E2E testing)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fall back to cookie
  const cookieHeader = req.headers.cookie;
  return parseJwtFromCookie(cookieHeader);
};

/**
 * Extract and verify user from JWT (cookie or Authorization header).
 * Supports both normal JWTs and staging bypass JWTs (when enabled).
 */
export const extractUser = (
  req: http.IncomingMessage,
  authConfig: AuthConfig,
): JwtPayload | null => {
  const token = extractToken(req);
  if (!token) {
    return null;
  }

  // Try normal JWT verification first
  const normalPayload = verifyJwt(token, authConfig);
  if (normalPayload) {
    return normalPayload;
  }

  // If staging bypass is enabled, try staging bypass JWT
  if (isStagingBypassEnabled()) {
    const stagingPayload = verifyStagingBypassJwt(token, authConfig);
    if (stagingPayload) {
      // Log that staging bypass was used (is_santa claim)
      console.log('[auth] 🎅 Staging bypass JWT verified (is_santa=true)');
      return stagingPayload;
    }
  }

  return null;
};

export const requireAuthentication = (
  req: AuthenticatedRequest,
  res: http.ServerResponse,
  authConfig: AuthConfig,
): boolean => {
  const user = extractUser(req, authConfig);
  if (!user) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Authentication required' }));
    return false;
  }
  req.user = user;
  return true;
};

export const DEFAULT_PUBLIC_PATHS: ReadonlyArray<string> = [
  '/__ual/healthz',
  '/__ual/auth/request-link',
  '/__ual/auth/verify',
  '/__ual/api/stripe/checkout',
  '/__ual/api/stripe/config',
  '/__ual/api/stripe/webhook',
  '/__ual/live',
  '/__ual/runtime',
];

export const createAuthGuard = (
  authConfig: AuthConfig,
  publicPaths: ReadonlyArray<string> = DEFAULT_PUBLIC_PATHS,
) => {
  return (
    req: AuthenticatedRequest,
    res: http.ServerResponse,
    pathname: string,
  ): boolean => {
    // Public paths don't require auth
    if (isPublicPath(pathname, publicPaths)) {
      // Still try to extract user for optional auth
      req.user = extractUser(req, authConfig) ?? undefined;
      return true;
    }

    // Static assets don't require auth
    const isStaticAsset = /\.(js|css|svg|png|jpg|jpeg|gif|webp|woff2?|ico)$/i.test(pathname);
    if (isStaticAsset) {
      return true;
    }

    // Admin HTML pages are public - the React app handles auth internally
    // This allows the login page to be displayed
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      // Still try to extract user for optional auth context
      req.user = extractUser(req, authConfig) ?? undefined;
      return true;
    }

    // Only API routes require authentication (except public ones handled above)
    const requiresAuth = pathname.startsWith('/__ual/api');
    if (!requiresAuth) {
      return true;
    }

    return requireAuthentication(req, res, authConfig);
  };
};

