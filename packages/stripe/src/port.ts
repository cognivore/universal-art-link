import type { StripeMode } from '@ual/core';

/** Stripe integration port. Three adapters implement this. */
export type StripePort = {
  readonly mode: StripeMode;

  /** Get the current connection status for a tenant. */
  readonly getStatus: (tenantId: string) => Promise<StripeStatus>;

  /** Create a checkout session (connect / restricted_key modes only). */
  readonly createCheckoutSession: (params: CheckoutParams) => Promise<CheckoutResult>;
};

export type StripeStatus = {
  readonly connected: boolean;
  readonly mode: StripeMode;
  readonly accountId?: string;
};

export type CheckoutParams = {
  readonly tenantId: string;
  readonly lineItems: ReadonlyArray<{
    readonly priceId: string;
    readonly quantity: number;
  }>;
  readonly successUrl: string;
  readonly cancelUrl: string;
};

export type CheckoutResult = {
  readonly sessionId: string;
  readonly url: string;
};
