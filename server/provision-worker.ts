import { log } from '../src/lib/logger.js';
import { StrapiTenantStore } from '../src/lib/strapiTenantStore.js';
import { CloudflareProvider, DnsProvisioner } from '../src/lib/dnsProvisioner.js';
import { CaddyAdminClient } from '../src/lib/caddyConfigurator.js';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}`);
  }
  return value;
};

const main = async (): Promise<void> => {
  const strapiUrl = requireEnv('UAL_STRAPI_URL');
  const strapiToken = requireEnv('UAL_STRAPI_TOKEN');
  const zoneId = requireEnv('UAL_CLOUDFLARE_ZONE');
  const cfToken = requireEnv('UAL_CLOUDFLARE_TOKEN');
  const platformRoot = requireEnv('UAL_PLATFORM_ROOT'); // e.g. example.com
  const upstream = requireEnv('UAL_SITE_UPSTREAM'); // e.g. http://127.0.0.1:4173
  const caddyAdminUrl = requireEnv('UAL_CADDY_ADMIN_URL'); // e.g. http://127.0.0.1:2019

  const strapi = new StrapiTenantStore(strapiUrl, strapiToken, log);
  const dnsProvider = new CloudflareProvider(cfToken, zoneId);
  const dnsProvisioner = new DnsProvisioner(dnsProvider, log);
  const caddy = new CaddyAdminClient(caddyAdminUrl, log);

  const tenants = await strapi.listTenants();
  const pending = tenants.filter((tenant) => tenant.status !== 'active');
  if (!pending.length) {
    log.info('No pending tenants');
    return;
  }

  for (const tenant of pending) {
    const hostname = `${tenant.subdomain}.${platformRoot}`;
    log.info(`Provisioning ${hostname}`);
    await dnsProvisioner.provision({
      type: 'CNAME',
      name: hostname,
      content: platformRoot,
      ttl: 60,
    });
    await caddy.ensureReverseProxy({ hostname, upstream });
    await caddy.reload();
    await strapi.updateTenantStatus(tenant.id, { status: 'active', customDomain: tenant.customDomain });
    log.success(`Tenant ${tenant.slug} activated`);
  }
};

main().catch((error) => {
  log.error('Provisioning worker failed', error);
  process.exitCode = 1;
});

