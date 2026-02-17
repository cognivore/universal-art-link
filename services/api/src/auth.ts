import { createHash, randomBytes } from 'node:crypto';
import * as jose from 'jose';
import { config } from './config.js';

const MAGIC_LINK_BYTES = 32;

export type TokenPayload = {
  readonly sub: string;
  readonly email: string;
};

const jwtKey = () => new TextEncoder().encode(config.jwtSecret);

/** Generate a random magic link token and its SHA-256 hash (for DB storage). */
export const generateMagicToken = (): { token: string; hash: string } => {
  const token = randomBytes(MAGIC_LINK_BYTES).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  return { token, hash };
};

/** Hash a magic link token for DB lookup. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** Sign a JWT session token. */
export const signJwt = async (userId: string, email: string): Promise<string> =>
  new jose.SignJWT({ email } satisfies Omit<TokenPayload, 'sub'>)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${config.jwtExpirySeconds}s`)
    .sign(jwtKey());

/** Verify and decode a JWT session token. Returns null if invalid. */
export const verifyJwt = async (token: string): Promise<TokenPayload | null> => {
  try {
    const { payload } = await jose.jwtVerify(token, jwtKey());
    if (!payload.sub) return null;
    return { sub: payload.sub, email: payload['email'] as string };
  } catch {
    return null;
  }
};
