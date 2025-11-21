import { Logger } from './logger.js';

export type ReverseProxyOptions = {
  readonly hostname: string;
  readonly upstream: string;
};

export class CaddyAdminClient {
  constructor(private readonly adminUrl: string, private readonly logger: Logger) {}

  private endpoint(path: string): string {
    return `${this.adminUrl.replace(/\/$/, '')}${path}`;
  }

  async ensureReverseProxy({ hostname, upstream }: ReverseProxyOptions): Promise<void> {
    const route = {
      match: [{ host: [hostname] }],
      handle: [
        {
          handler: 'reverse_proxy',
          upstreams: [{ dial: upstream }],
        },
      ],
    };

    this.logger.info(`Configuring Caddy route for ${hostname} → ${upstream}`);
    const response = await fetch(this.endpoint('/config/apps/http/servers/ual/routes'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(route),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Failed to update Caddy');
    }
  }

  async reload(): Promise<void> {
    const response = await fetch(this.endpoint('/load'), { method: 'POST' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || 'Caddy reload failed');
    }
    this.logger.success('Caddy config reloaded');
  }
}

