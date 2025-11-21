import dns from 'node:dns/promises';
import { Logger } from './logger.js';

export type DnsRecordRequest = {
  readonly type: 'CNAME' | 'A' | 'TXT';
  readonly name: string;
  readonly content: string;
  readonly ttl?: number;
};

export interface DnsProvider {
  readonly createRecord: (request: DnsRecordRequest) => Promise<void>;
  readonly ensureTxt?: (name: string, value: string) => Promise<void>;
}

export class CloudflareProvider implements DnsProvider {
  private readonly apiBase = 'https://api.cloudflare.com/client/v4';

  constructor(private readonly token: string, private readonly zoneId: string) {}

  async createRecord(request: DnsRecordRequest): Promise<void> {
    const response = await fetch(`${this.apiBase}/zones/${this.zoneId}/dns_records`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: request.type,
        name: request.name,
        content: request.content,
        ttl: request.ttl ?? 60,
        proxied: false,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Cloudflare API error');
    }
  }

  async ensureTxt(name: string, value: string): Promise<void> {
    await this.createRecord({ type: 'TXT', name, content: value, ttl: 60 });
  }
}

export class MockDnsProvider implements DnsProvider {
  async createRecord(request: DnsRecordRequest): Promise<void> {
    console.log('[mock-dns] create', request);
  }
}

export class DnsProvisioner {
  constructor(private readonly provider: DnsProvider, private readonly logger: Logger) {}

  async provision(record: DnsRecordRequest, timeoutMs = 60_000): Promise<void> {
    this.logger.info(`Creating DNS record ${record.name} (${record.type})`);
    await this.provider.createRecord(record);
    await this.waitForPropagation(record, timeoutMs);
    this.logger.success(`DNS propagated for ${record.name}`);
  }

  private async waitForPropagation(record: DnsRecordRequest, timeoutMs: number): Promise<void> {
    const started = Date.now();
    const check = async (): Promise<boolean> => {
      try {
        if (record.type === 'CNAME') {
          const result = await dns.resolveCname(record.name);
          return result.some((entry) => entry.replace(/\.$/, '') === record.content.replace(/\.$/, ''));
        }
        if (record.type === 'A') {
          const result = await dns.resolve(record.name);
          return result.includes(record.content);
        }
        if (record.type === 'TXT') {
          const result = await dns.resolveTxt(record.name);
          return result.some((entry) => entry.join('') === record.content);
        }
        return false;
      } catch {
        return false;
      }
    };

    while (Date.now() - started < timeoutMs) {
      if (await check()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
    throw new Error(`DNS propagation timed out for ${record.name}`);
  }
}

