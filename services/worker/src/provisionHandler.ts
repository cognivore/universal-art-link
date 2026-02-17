import type { TenantRepo, DomainRepo } from '@ual/storage';
import type { PorkbunPort, CaddyPort } from '@ual/provisioning';
import pino from 'pino';

const log = pino({ name: 'provision-handler' });

export type ProvisionJobData = {
  tenantId: string;
};

export const handleProvision = (
  tenantRepo: TenantRepo,
  domainRepo: DomainRepo,
  porkbun: PorkbunPort,
  caddy: CaddyPort,
  baseDomain: string,
) =>
  async (data: ProvisionJobData): Promise<void> => {
    const { tenantId } = data;
    log.info({ tenantId }, 'Starting provisioning');

    const tenant = await tenantRepo.findById(tenantId);
    if (!tenant) throw new Error('Tenant not found');

    const hostname = `${tenant.slug}.${baseDomain}`;

    const domain = await domainRepo.create(tenantId, hostname);

    try {
      await porkbun.createRecord(tenant.slug, baseDomain);
      log.info({ hostname }, 'DNS record created');

      await porkbun.waitForPropagation(hostname);
      log.info({ hostname }, 'DNS propagated');

      await caddy.addTenantRoute(hostname, tenantId);
      log.info({ hostname }, 'Caddy route added');

      await domainRepo.updateStatus(domain.id, 'active');
      await tenantRepo.updateStatus(tenantId, 'active');

      log.info({ tenantId, hostname }, 'Provisioning complete');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error({ tenantId, err: message }, 'Provisioning failed');
      await domainRepo.updateStatus(domain.id, 'error', { error: message });
      throw err;
    }
  };
