/**
 * Generate a new UUID v4.
 * Uses globalThis.crypto which works in both Node.js and browsers.
 */
export const newId = (): string => globalThis.crypto.randomUUID();
