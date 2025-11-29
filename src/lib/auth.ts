import crypto from 'node:crypto';
import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';

const AdminSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
});

const AdminsConfigSchema = z.object({
  admins: z.array(AdminSchema).default([]),
});

export type Admin = z.infer<typeof AdminSchema>;
export type AdminsConfig = z.infer<typeof AdminsConfigSchema>;

export type MagicLinkToken = {
  readonly email: string;
  readonly expiresAt: number;
  readonly nonce: string;
  readonly requestIp?: string; // IP address from which magic link was requested
};

export type JwtPayload = {
  readonly sub: string; // email
  readonly name: string;
  readonly iat: number;
  readonly exp: number;
  readonly requestIp?: string; // IP captured at magic link request
  readonly verifyIp?: string; // IP at verification time
  readonly is_santa?: boolean; // Staging bypass claim (Christmas-themed!)
};

export type AuthConfig = {
  readonly jwtSecret: string;
  readonly magicLinkSecret: string;
  readonly jwtTtlSeconds: number;
  readonly magicLinkTtlSeconds: number;
  readonly baseUrl: string;
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer.toString('base64url');
};

const base64UrlDecode = (input: string): Buffer => Buffer.from(input, 'base64url');

const hmacSign = (data: string, secret: string): string => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return base64UrlEncode(hmac.digest());
};

const hmacVerify = (data: string, signature: string, secret: string): boolean => {
  const expected = hmacSign(data, secret);
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

export const loadAdminsConfig = async (contentDir: string): Promise<AdminsConfig> => {
  const configPath = path.join(contentDir, 'auth', 'admins.yaml');
  const exists = await fs.pathExists(configPath);
  if (!exists) {
    return { admins: [] };
  }
  const content = await fs.readFile(configPath, 'utf8');
  const parsed = YAML.parse(content) as unknown;
  return AdminsConfigSchema.parse(parsed);
};

export const isAuthorizedEmail = async (email: string, contentDir: string): Promise<Admin | null> => {
  const config = await loadAdminsConfig(contentDir);
  const normalizedEmail = email.toLowerCase().trim();
  const admin = config.admins.find((a) => a.email.toLowerCase().trim() === normalizedEmail);
  return admin ?? null;
};

export const generateMagicLinkToken = (email: string, config: AuthConfig, requestIp?: string): string => {
  const nonce = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + config.magicLinkTtlSeconds * 1000;
  const payload: MagicLinkToken = {
    email: email.toLowerCase().trim(),
    expiresAt,
    nonce,
    requestIp: requestIp ?? undefined,
  };
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const signature = hmacSign(payloadStr, config.magicLinkSecret);
  return `${payloadStr}.${signature}`;
};

export const verifyMagicLinkToken = (token: string, config: AuthConfig): MagicLinkToken | null => {
  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }
  const [payloadStr, signature] = parts as [string, string];
  if (!hmacVerify(payloadStr, signature, config.magicLinkSecret)) {
    return null;
  }
  try {
    const decoded = base64UrlDecode(payloadStr).toString('utf8');
    const payload = JSON.parse(decoded) as MagicLinkToken;
    if (payload.expiresAt < Date.now()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const generateMagicLinkUrl = (email: string, config: AuthConfig, requestIp?: string): string => {
  const token = generateMagicLinkToken(email, config, requestIp);
  return `${config.baseUrl}/__ual/auth/verify?token=${encodeURIComponent(token)}`;
};

export type CreateJwtOptions = {
  requestIp?: string;
  verifyIp?: string;
};

export const createJwt = (admin: Admin, config: AuthConfig, options?: CreateJwtOptions): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = {
    sub: admin.email.toLowerCase().trim(),
    name: admin.name,
    iat: now,
    exp: now + config.jwtTtlSeconds,
    requestIp: options?.requestIp,
    verifyIp: options?.verifyIp,
  };
  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerStr}.${payloadStr}`;
  const signature = hmacSign(dataToSign, config.jwtSecret);
  return `${dataToSign}.${signature}`;
};

export const verifyJwt = (token: string, config: AuthConfig): JwtPayload | null => {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerStr, payloadStr, signature] = parts as [string, string, string];
  const dataToVerify = `${headerStr}.${payloadStr}`;
  if (!hmacVerify(dataToVerify, signature, config.jwtSecret)) {
    return null;
  }
  try {
    const decoded = base64UrlDecode(payloadStr).toString('utf8');
    const payload = JSON.parse(decoded) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

export const parseJwtFromCookie = (cookieHeader: string | undefined): string | null => {
  if (!cookieHeader) {
    return null;
  }
  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');
    if (name === 'ual_session') {
      return valueParts.join('=');
    }
  }
  return null;
};

export const createSessionCookie = (jwt: string, maxAge: number): string =>
  `ual_session=${jwt}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;

export const createLogoutCookie = (): string =>
  'ual_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0';

export const generateSecureSecret = (): string => crypto.randomBytes(32).toString('hex');

export const createAuthConfig = (options: {
  jwtSecret?: string;
  magicLinkSecret?: string;
  jwtTtlSeconds?: number;
  magicLinkTtlSeconds?: number;
  baseUrl: string;
}): AuthConfig => ({
  jwtSecret: options.jwtSecret ?? process.env.UAL_JWT_SECRET ?? generateSecureSecret(),
  magicLinkSecret: options.magicLinkSecret ?? process.env.UAL_MAGIC_LINK_SECRET ?? generateSecureSecret(),
  jwtTtlSeconds: options.jwtTtlSeconds ?? 7 * 24 * 60 * 60, // 7 days
  magicLinkTtlSeconds: options.magicLinkTtlSeconds ?? 15 * 60, // 15 minutes
  baseUrl: options.baseUrl,
});

// =============================================================================
// Staging Bypass Authentication
// =============================================================================

export const isStagingBypassEnabled = (): boolean =>
  process.env.UAL_STAGING_BYPASS === 'true';

export const getStagingBypassJwt = (): string | null =>
  process.env.UAL_STAGING_JWT ?? null;

export const verifyStagingBypassJwt = (token: string, config: AuthConfig): JwtPayload | null => {
  // Only allow staging bypass if explicitly enabled
  if (!isStagingBypassEnabled()) {
    return null;
  }

  // Verify the JWT structure and signature
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [headerStr, payloadStr, signature] = parts as [string, string, string];
  const dataToVerify = `${headerStr}.${payloadStr}`;

  if (!hmacVerify(dataToVerify, signature, config.jwtSecret)) {
    return null;
  }

  try {
    const decoded = base64UrlDecode(payloadStr).toString('utf8');
    const payload = JSON.parse(decoded) as JwtPayload;
    const now = Math.floor(Date.now() / 1000);

    // Check expiration
    if (payload.exp < now) {
      return null;
    }

    // Must have is_santa=true claim for staging bypass
    if (!payload.is_santa) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

export const checkIpMismatch = (
  requestIp: string | undefined,
  verifyIp: string | undefined,
): { mismatch: boolean; message?: string } => {
  if (!requestIp || !verifyIp) {
    return { mismatch: false };
  }

  if (requestIp !== verifyIp) {
    return {
      mismatch: true,
      message: `Magic link requested from ${requestIp} but verified from ${verifyIp}. ` +
        'This may indicate session sharing or user roaming.',
    };
  }

  return { mismatch: false };
};

export const getClientIp = (
  headers: Record<string, string | string[] | undefined>,
  socketAddress?: string,
): string => {
  // Check common proxy headers
  const forwardedFor = headers['x-forwarded-for'];
  if (forwardedFor) {
    const ip = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor.split(',')[0];
    return ip?.trim() ?? 'unknown';
  }

  const realIp = headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] ?? 'unknown' : realIp;
  }

  const cfConnectingIp = headers['cf-connecting-ip'];
  if (cfConnectingIp) {
    return Array.isArray(cfConnectingIp) ? cfConnectingIp[0] ?? 'unknown' : cfConnectingIp;
  }

  return socketAddress ?? 'unknown';
};

