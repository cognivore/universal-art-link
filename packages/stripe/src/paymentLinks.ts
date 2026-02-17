import type { StripePort, StripeStatus, CheckoutParams, CheckoutResult } from './port.js';

/**
 * Payment links adapter.
 * Stores only URLs; no Stripe secret needed on UAL side.
 * Buying opens Stripe-hosted checkout via link.
 */
export const createPaymentLinksAdapter = (): StripePort => ({
  mode: 'payment_links',

  async getStatus(): Promise<StripeStatus> {
    return { connected: true, mode: 'payment_links' };
  },

  async createCheckoutSession(_params: CheckoutParams): Promise<CheckoutResult> {
    throw new Error(
      'Checkout sessions are not used in payment_links mode. Use Stripe payment link URLs directly.',
    );
  },
});
