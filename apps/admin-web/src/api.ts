const api = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
};

export type MediaAsset = {
  id: string;
  url: string;
  mime: string;
  storageKey: string;
  createdAt: string;
};

export type StripeStatus = {
  connected: boolean;
  mode: string;
  accountId?: string;
};

export type TenantInfo = {
  id: string;
  slug: string;
  status: string;
  primaryDomain: string | null;
  mode: string;
  createdAt: string;
  domains?: DomainInfo[];
  stripe?: StripeStatus | null;
};

export type DomainInfo = {
  id: string;
  tenantId: string;
  hostname: string;
  status: string;
  createdAt: string;
};

export const authApi = {
  login: (email: string) =>
    api<{ ok: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  me: () =>
    api<{ id: string; email: string; memberships: Array<{ role: string }> }>('/api/auth/me'),

  logout: () =>
    api<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
};

export const siteApi = {
  listSnapshots: () =>
    api<unknown[]>('/api/site/snapshots'),

  createSnapshot: (label?: string) =>
    api<{ id: string }>('/api/site/snapshots', {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  rollback: (snapshotId: string) =>
    api<{ docVersion: number }>('/api/site/rollback', {
      method: 'POST',
      body: JSON.stringify({ snapshotId }),
    }),

  publish: () =>
    api<{ jobId: string }>('/api/site/publish', { method: 'POST' }),

  publishStatus: () =>
    api<{ status: string }>('/api/site/publish/status'),
};

export const mediaApi = {
  upload: async (file: File): Promise<MediaAsset> => {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/media/upload', {
      method: 'POST',
      credentials: 'include',
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? `Upload failed`);
    }
    return res.json() as Promise<MediaAsset>;
  },

  list: () => api<MediaAsset[]>('/api/media/list'),
};

export const stripeApi = {
  status: () => api<StripeStatus>('/api/stripe/status'),

  connectStart: () =>
    api<{ url: string }>('/api/stripe/connect/start', { method: 'POST' }),
};

export const metaApi = {
  listTenants: () => api<TenantInfo[]>('/api/meta/tenants'),

  getTenant: (id: string) => api<TenantInfo>(`/api/meta/tenants/${id}`),

  createTenant: (data: {
    slug: string;
    ownerEmail: string;
    domain?: string;
    mode?: string;
    provision?: boolean;
  }) =>
    api<{ tenant: TenantInfo; owner: { id: string; email: string }; domain: DomainInfo | null }>(
      '/api/meta/tenants',
      { method: 'POST', body: JSON.stringify(data) },
    ),

  addDomain: (tenantId: string, hostname: string, provision = true) =>
    api<DomainInfo>(`/api/meta/tenants/${tenantId}/domains`, {
      method: 'POST',
      body: JSON.stringify({ hostname, provision }),
    }),

  listDomains: (tenantId: string) =>
    api<DomainInfo[]>(`/api/meta/tenants/${tenantId}/domains`),

  setStripe: (tenantId: string, mode: string, connectAccountId?: string) =>
    api<{ ok: boolean }>(`/api/meta/tenants/${tenantId}/stripe`, {
      method: 'POST',
      body: JSON.stringify({ mode, connectAccountId }),
    }),

  listRegistrations: () => api<Array<{ id: string; email: string; status: string }>>('/api/meta/registrations'),

  approveRegistration: (id: string, slug: string) =>
    api<{ tenantId: string; slug: string }>(`/api/meta/registrations/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ slug }),
    }),

  rejectRegistration: (id: string) =>
    api<{ ok: boolean }>(`/api/meta/registrations/${id}/reject`, { method: 'POST' }),
};
