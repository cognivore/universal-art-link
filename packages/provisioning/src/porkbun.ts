import { resolve } from 'node:dns/promises';
import type { PorkbunPort } from './ports.js';

const PORKBUN_API = 'https://api.porkbun.com/api/json/v3';

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Porkbun DNS adapter.
 * Idempotent: creating an existing record is safe.
 */
export const createPorkbunAdapter = (
  apiKey: string,
  secretKey: string,
): PorkbunPort => {
  const post = async (path: string, body: Record<string, unknown>): Promise<unknown> => {
    const res = await fetch(`${PORKBUN_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: apiKey, secretapikey: secretKey, ...body }),
    });
    const json = await res.json();
    if (!res.ok && (json as { status?: string }).status !== 'SUCCESS') {
      throw new Error(`Porkbun API error: ${JSON.stringify(json)}`);
    }
    return json;
  };

  return {
    async createRecord(slug, baseDomain) {
      await post(`/dns/create/${baseDomain}`, {
        name: slug,
        type: 'CNAME',
        content: baseDomain,
        ttl: '600',
      });
    },

    async deleteRecord(slug, baseDomain) {
      await post(`/dns/deleteByNameType/${baseDomain}/CNAME/${slug}`, {});
    },

    async waitForPropagation(hostname, timeoutMs = 120_000) {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          await resolve(hostname);
          return;
        } catch {
          await sleep(5_000);
        }
      }
      throw new Error(`DNS propagation timeout for ${hostname}`);
    },
  };
};
