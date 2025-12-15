/**
 * Staging Authentication Bypass
 *
 * Generates and manages staging bypass JWTs with the "is_santa" claim.
 * This is used for E2E testing against the staging environment.
 *
 * SECURITY: The staging bypass is ONLY enabled when UAL_STAGING_BYPASS=true
 * in the environment. Production deployments should NEVER set this variable.
 */

import crypto from 'node:crypto';

export type StagingJwtPayload = {
  readonly sub: string;
  readonly name: string;
  readonly is_santa: true; // Christmas-themed bypass claim! 🎅
  readonly iat: number;
  readonly exp: number;
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buffer = typeof input === 'string' ? Buffer.from(input) : input;
  return buffer.toString('base64url');
};

const hmacSign = (data: string, secret: string): string => {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(data);
  return base64UrlEncode(hmac.digest());
};

/**
 * Generate a staging bypass JWT with the is_santa claim.
 * This JWT is meant to be generated at deployment time and embedded
 * into the staging environment's .env file.
 *
 * @param jwtSecret - The JWT secret to sign with
 * @param ttlDays - How long the JWT should be valid (default: 365 days)
 * @returns The signed JWT token
 */
export const generateStagingBypassJwt = (
  jwtSecret: string,
  ttlDays: number = 365,
): string => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);

  const payload: StagingJwtPayload = {
    sub: 'staging@ual.local',
    name: 'Staging Santa 🎅',
    is_santa: true,
    iat: now,
    exp: now + ttlDays * 24 * 60 * 60,
  };

  const headerStr = base64UrlEncode(JSON.stringify(header));
  const payloadStr = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${headerStr}.${payloadStr}`;
  const signature = hmacSign(dataToSign, jwtSecret);

  return `${dataToSign}.${signature}`;
};

/**
 * CLI utility to generate a staging bypass JWT.
 * Usage: npx tsx src/lib/stagingAuth.ts [jwt-secret]
 *
 * If no secret is provided, one is generated and printed alongside the JWT.
 */
const main = (): void => {
  const secret = process.argv[2] ?? crypto.randomBytes(32).toString('hex');
  const jwt = generateStagingBypassJwt(secret);

  console.log('='.repeat(72));
  console.log('UAL Staging Bypass JWT Generator');
  console.log('='.repeat(72));
  console.log('');
  console.log('🎄 This JWT contains the is_santa=true claim for staging auth bypass.');
  console.log('');
  console.log('JWT Secret (UAL_JWT_SECRET):');
  console.log(secret);
  console.log('');
  console.log('Staging JWT (UAL_STAGING_JWT):');
  console.log(jwt);
  console.log('');
  console.log('Add to your staging .env file:');
  console.log('');
  console.log(`UAL_JWT_SECRET=${secret}`);
  console.log('UAL_STAGING_BYPASS=true');
  console.log(`UAL_STAGING_JWT=${jwt}`);
  console.log('');
  console.log('⚠️  NEVER use these values in production!');
  console.log('='.repeat(72));
};

// Run CLI if executed directly
if (process.argv[1]?.includes('stagingAuth')) {
  main();
}






