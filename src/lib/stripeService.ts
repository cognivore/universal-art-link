import Stripe from 'stripe';
import type { StripeConfig, StripeProduct, CheckoutSessionRequest, CheckoutSessionResponse } from '../types/stripe-commerce.js';

export type StripeService = {
  readonly createCheckoutSession: (
    product: StripeProduct,
    request: CheckoutSessionRequest,
    urls: { success: string; cancel: string },
  ) => Promise<CheckoutSessionResponse>;
  readonly constructWebhookEvent: (
    payload: string | Buffer,
    signature: string,
  ) => Stripe.Event;
  readonly retrieveSession: (sessionId: string) => Promise<Stripe.Checkout.Session>;
  readonly retrieveSubscription: (subscriptionId: string) => Promise<Stripe.Subscription>;
  readonly cancelSubscription: (subscriptionId: string) => Promise<Stripe.Subscription>;
  readonly getPublishableKey: () => string;
};

export const createStripeService = (config: StripeConfig): StripeService => {
  const stripe = new Stripe(config.secretKey, {
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });

  const createCheckoutSession = async (
    product: StripeProduct,
    request: CheckoutSessionRequest,
    urls: { success: string; cancel: string },
  ): Promise<CheckoutSessionResponse> => {
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        currency: product.currency.toLowerCase(),
        unit_amount: product.priceAmountCents,
        product_data: {
          name: product.name,
          description: product.description || undefined,
          images: product.imageUrl ? [product.imageUrl] : undefined,
          metadata: {
            ual_product_id: product.id,
          },
        },
        ...(product.type === 'subscription' && product.interval
          ? {
              recurring: {
                interval: product.interval,
                interval_count: product.intervalCount ?? 1,
              },
            }
          : {}),
      },
      quantity: request.quantity,
    };

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: product.type === 'subscription' ? 'subscription' : 'payment',
      line_items: [lineItem],
      success_url: urls.success,
      cancel_url: urls.cancel,
      payment_method_types: ['card', 'link'],
      billing_address_collection: 'auto',
      metadata: {
        ual_product_id: product.id,
        ual_product_name: product.name,
      },
    };

    if (request.customerEmail) {
      sessionParams.customer_email = request.customerEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    if (!session.url) {
      throw new Error('Stripe session created but no URL returned');
    }

    return {
      sessionId: session.id,
      url: session.url,
    };
  };

  const constructWebhookEvent = (payload: string | Buffer, signature: string): Stripe.Event => {
    if (!config.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }
    return stripe.webhooks.constructEvent(payload, signature, config.webhookSecret);
  };

  const retrieveSession = async (sessionId: string): Promise<Stripe.Checkout.Session> =>
    stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'subscription', 'customer'],
    });

  const retrieveSubscription = async (subscriptionId: string): Promise<Stripe.Subscription> =>
    stripe.subscriptions.retrieve(subscriptionId);

  const cancelSubscription = async (subscriptionId: string): Promise<Stripe.Subscription> =>
    stripe.subscriptions.cancel(subscriptionId);

  const getPublishableKey = (): string => config.publishableKey;

  return {
    createCheckoutSession,
    constructWebhookEvent,
    retrieveSession,
    retrieveSubscription,
    cancelSubscription,
    getPublishableKey,
  };
};

