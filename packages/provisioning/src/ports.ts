/** Port interface for DNS provisioning. */
export type PorkbunPort = {
  readonly createRecord: (slug: string, baseDomain: string) => Promise<void>;
  readonly deleteRecord: (slug: string, baseDomain: string) => Promise<void>;
  readonly waitForPropagation: (hostname: string, timeoutMs?: number) => Promise<void>;
};

/** Port interface for Caddy configuration. */
export type CaddyPort = {
  readonly addTenantRoute: (hostname: string, tenantId: string) => Promise<void>;
  readonly removeTenantRoute: (hostname: string) => Promise<void>;
};
