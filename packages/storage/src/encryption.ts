import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a buffer: [iv (12 bytes) | ciphertext | auth tag (16 bytes)].
 */
export const encrypt = (plaintext: string, keyHex: string): Uint8Array => {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return new Uint8Array(Buffer.concat([iv, encrypted, tag]));
};

/**
 * Decrypt a buffer previously encrypted with `encrypt`.
 */
export const decrypt = (data: Uint8Array, keyHex: string): string => {
  const key = Buffer.from(keyHex, 'hex');
  const buf = Buffer.from(data);

  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(buf.length - TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH, buf.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
};
