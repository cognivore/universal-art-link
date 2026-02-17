import Stripe from 'stripe';
import type { StripePort, StripeStatus, CheckoutParams, CheckoutResult } from './port.js';

/**
 * Restricted key adapter (self-host advanced).
 * Stores an encrypted Stripe restricted key server-side.
 * Permissions should be minimal (checkout session creation).
 */
export const createRestrictedKeyAdapter = (
  getDecryptedKey: (tenantId: string) => Promise<string | null>,
): StripePort => ({
  mode: 'restricted_key',

  async getStatus(tenantId): Promise<StripeStatus> {
    const key = await getDecryptedKey(tenantId);
    return { connected: key != null, mode: 'restricted_key' };
  },

  async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
    const key = await getDecryptedKey(params.tenantId);
    if (!key) throw new Error('No Stripe restricted key configured');

    const stripe = new Stripe(key);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: params.lineItems.map((li) => ({
        price: li.priceId,
        quantity: li.quantity,
      })),
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });

    return { sessionId: session.id, url: session.url! };
  },
});
