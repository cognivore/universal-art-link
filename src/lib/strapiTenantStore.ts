import { Logger } from './logger.js';

type HttpMethod = 'GET' | 'POST' | 'PATCH';

export type TenantRecord = {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly googleEmail: string;
  readonly status: 'draft' | 'pending_dns' | 'active';
  readonly subdomain: string;
  readonly customDomain?: string;
};

export type CreateTenantInput = {
  readonly name: string;
  readonly googleEmail: string;
  readonly subdomain: string;
  readonly plan?: string;
};

export type UpdateTenantStatusInput = {
  readonly status: TenantRecord['status'];
  readonly customDomain?: string;
};

export class StrapiTenantStore {
  private readonly apiBase: string;

  constructor(private readonly baseUrl: string, private readonly token: string, private readonly logger: Logger) {
    this.apiBase = `${baseUrl.replace(/\/$/, '')}/api`;
  }

  private async request<T>(
    path: string,
    method: HttpMethod,
    body?: Record<string, unknown>,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify({ data: body }) : undefined,
      ...init,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Strapi request failed (${response.status})`);
    }

    return (await response.json()) as T;
  }

  async listTenants(): Promise<ReadonlyArray<TenantRecord>> {
    const payload = await this.request<{ data: Array<{ id: number; attributes: Record<string, unknown> }> }>('/tenants', 'GET');
    return payload.data.map((entry) => ({
      id: entry.id,
      name: String(entry.attributes.name ?? ''),
      slug: String(entry.attributes.slug ?? ''),
      googleEmail: String(entry.attributes.googleEmail ?? ''),
      status: (entry.attributes.status as TenantRecord['status']) ?? 'draft',
      subdomain: String(entry.attributes.subdomain ?? ''),
      customDomain: entry.attributes.customDomain ? String(entry.attributes.customDomain) : undefined,
    }));
  }

  async createTenant(input: CreateTenantInput): Promise<TenantRecord> {
    this.logger.info(`Creating Strapi tenant ${input.subdomain}`);
    const payload = await this.request<{ data: { id: number; attributes: Record<string, unknown> } }>('/tenants', 'POST', input);
    return {
      id: payload.data.id,
      name: String(payload.data.attributes.name ?? input.name),
      slug: String(payload.data.attributes.slug ?? input.subdomain),
      googleEmail: String(payload.data.attributes.googleEmail ?? input.googleEmail),
      status: (payload.data.attributes.status as TenantRecord['status']) ?? 'draft',
      subdomain: String(payload.data.attributes.subdomain ?? input.subdomain),
      customDomain: payload.data.attributes.customDomain ? String(payload.data.attributes.customDomain) : undefined,
    };
  }

  async updateTenantStatus(id: number, input: UpdateTenantStatusInput): Promise<void> {
    this.logger.info(`Updating tenant #${id} → ${input.status}`);
    await this.request(`/tenants/${id}`, 'PATCH', input);
  }

  async signalDnsReady(id: number, hostname: string): Promise<void> {
    await this.updateTenantStatus(id, { status: 'pending_dns', customDomain: hostname });
  }
}

