import Stripe from 'stripe';
import type { StripePort, StripeStatus, CheckoutParams, CheckoutResult } from './port.js';

/**
 * Stripe Connect adapter (hosted multi-tenant).
 * UAL stores connect_account_id; no tenant secrets stored.
 * Uses platform's Stripe secret to act on behalf of connected account.
 */
export const createConnectAdapter = (
  platformSecretKey: string,
  getConnectAccountId: (tenantId: string) => Promise<string | null>,
): StripePort => {
  const stripe = new Stripe(platformSecretKey);

  return {
    mode: 'connect',

    async getStatus(tenantId): Promise<StripeStatus> {
      const accountId = await getConnectAccountId(tenantId);
      return {
        connected: accountId != null,
        mode: 'connect',
        accountId: accountId ?? undefined,
      };
    },

    async createCheckoutSession(params: CheckoutParams): Promise<CheckoutResult> {
      const accountId = await getConnectAccountId(params.tenantId);
      if (!accountId) throw new Error('Stripe Connect account not linked');

      const session = await stripe.checkout.sessions.create(
        {
          mode: 'payment',
          line_items: params.lineItems.map((li) => ({
            price: li.priceId,
            quantity: li.quantity,
          })),
          success_url: params.successUrl,
          cancel_url: params.cancelUrl,
        },
        { stripeAccount: accountId },
      );

      return { sessionId: session.id, url: session.url! };
    },
  };
};

/**
 * Generate a Stripe Connect OAuth URL for a tenant to link their account.
 */
export const createConnectOAuthUrl = (
  clientId: string,
  redirectUri: string,
  state: string,
): string =>
  `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

/**
 * Exchange an OAuth authorization code for a connected account ID.
 */
export const exchangeConnectCode = async (
  platformSecretKey: string,
  code: string,
): Promise<string> => {
  const stripe = new Stripe(platformSecretKey);
  const response = await stripe.oauth.token({ grant_type: 'authorization_code', code });
  if (!response.stripe_user_id) throw new Error('No stripe_user_id in OAuth response');
  return response.stripe_user_id;
};
