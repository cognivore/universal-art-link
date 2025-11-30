import Stripe from 'stripe';
import type { StripeConfig, StripeProduct, CheckoutSessionRequest, CheckoutSessionResponse } from '../types/stripe-commerce.js';

export type StripeCheckoutSession = {
  id: string;
  status: 'open' | 'complete' | 'expired';
  customerEmail: string | null;
  amountTotal: number;
  currency: string;
  createdAt: string;
  productName: string | null;
  productId: string | null;
  paymentStatus: string;
};

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
  readonly retrieveProduct: (productId: string) => Promise<Stripe.Product>;
  readonly getPublishableKey: () => string;
  readonly listCheckoutSessions: (options?: { limit?: number }) => Promise<StripeCheckoutSession[]>;
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
    let lineItem: Stripe.Checkout.SessionCreateParams.LineItem;

    if (product.stripeProductId && product.stripePriceId) {
      lineItem = {
        price: product.stripePriceId,
        quantity: request.quantity,
      };
    } else {
      lineItem = {
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
    }

    const sessionMetadata: Record<string, string> = {
      ual_product_id: product.id,
      ual_product_name: product.name,
    };
    if (request.testInvocationId) {
      sessionMetadata.test_invocation_id = request.testInvocationId;
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: product.type === 'subscription' ? 'subscription' : 'payment',
      line_items: [lineItem],
      success_url: urls.success,
      cancel_url: urls.cancel,
      payment_method_types: ['card', 'link'],
      billing_address_collection: 'auto',
      metadata: sessionMetadata,
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

  const retrieveProduct = async (productId: string): Promise<Stripe.Product> =>
    stripe.products.retrieve(productId);

  const getPublishableKey = (): string => config.publishableKey;

  const listCheckoutSessions = async (
    options: { limit?: number } = {},
  ): Promise<StripeCheckoutSession[]> => {
    const sessions = await stripe.checkout.sessions.list({
      limit: options.limit ?? 50,
      expand: ['data.line_items'],
    });

    return sessions.data.map((session) => {
      const lineItem = session.line_items?.data[0];
      return {
        id: session.id,
        status: session.status ?? 'expired',
        customerEmail: session.customer_email ?? session.customer_details?.email ?? null,
        amountTotal: session.amount_total ?? 0,
        currency: session.currency?.toUpperCase() ?? 'USD',
        createdAt: new Date(session.created * 1000).toISOString(),
        productName: lineItem?.description ?? session.metadata?.ual_product_name ?? null,
        productId: session.metadata?.ual_product_id ?? null,
        paymentStatus: session.payment_status,
      };
    });
  };

  return {
    createCheckoutSession,
    constructWebhookEvent,
    retrieveSession,
    retrieveSubscription,
    cancelSubscription,
    retrieveProduct,
    getPublishableKey,
    listCheckoutSessions,
  };
};

