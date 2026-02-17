const required = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
};

const optional = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

const requiredOrFallback = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

export const config = {
  port: Number(optional('PORT', '3000')),
  host: optional('HOST', '0.0.0.0'),

  databaseUrl: requiredOrFallback('DATABASE_URL', 'postgresql://ual:ual_dev@localhost:5432/ual_test'),

  mode: optional('UAL_MODE', 'self_host') as 'hosted' | 'self_host',
  baseDomain: optional('UAL_BASE_DOMAIN', 'localhost'),

  jwtSecret: requiredOrFallback('JWT_SECRET', 'test-jwt-secret-not-for-production'),
  jwtExpirySeconds: 7 * 24 * 60 * 60,

  magicLinkExpiryMinutes: 15,
  resendApiKey: optional('RESEND_API_KEY', ''),
  emailFrom: optional('EMAIL_FROM', 'noreply@' + optional('UAL_BASE_DOMAIN', 'localhost')),
  adminEmails: optional('UAL_ADMIN_EMAILS', '').split(',').filter(Boolean),

  storagePath: optional('STORAGE_BASE_PATH', './data'),
  encryptionKey: optional('ENCRYPTION_KEY', ''),

  caddyAdminUrl: optional('CADDY_ADMIN_URL', 'http://127.0.0.1:2019'),
} as const;
