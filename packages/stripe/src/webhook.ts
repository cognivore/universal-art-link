import Stripe from 'stripe';

/**
 * Verify and parse a Stripe webhook event.
 * Pure function wrapping Stripe's signature verification.
 */
export const verifyWebhookEvent = (
  rawBody: string | Buffer,
  signature: string,
  webhookSecret: string,
): Stripe.Event => {
  const stripe = new Stripe('unused');
  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
};
