import { z } from 'zod';
import type { StripeConfig, StripeMode } from '../types/stripe-commerce.js';

const envSchema = z.object({
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_SECRET_KEY_TEST: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY_TEST: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_WEBHOOK_SECRET_TEST: z.string().optional(),
});

export type StripeEnvVars = z.infer<typeof envSchema>;

export const loadStripeEnv = (): StripeEnvVars => {
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_SECRET_KEY_TEST: process.env.STRIPE_SECRET_KEY_TEST,
    STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY,
    STRIPE_PUBLISHABLE_KEY_TEST: process.env.STRIPE_PUBLISHABLE_KEY_TEST,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_WEBHOOK_SECRET_TEST: process.env.STRIPE_WEBHOOK_SECRET_TEST,
  };
  return envSchema.parse(env);
};

export const createStripeConfig = (mode: StripeMode): StripeConfig => {
  const env = loadStripeEnv();

  if (mode === 'staging') {
    const secretKey = env.STRIPE_SECRET_KEY_TEST;
    const publishableKey = env.STRIPE_PUBLISHABLE_KEY_TEST;

    if (!secretKey || !publishableKey) {
      throw new Error(
        'Staging mode requires STRIPE_SECRET_KEY_TEST and STRIPE_PUBLISHABLE_KEY_TEST environment variables',
      );
    }

    return {
      mode: 'staging',
      secretKey,
      publishableKey,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET_TEST,
    };
  }

  const secretKey = env.STRIPE_SECRET_KEY;
  const publishableKey = env.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey || !publishableKey) {
    throw new Error(
      'Production mode requires STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY environment variables',
    );
  }

  return {
    mode: 'production',
    secretKey,
    publishableKey,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
  };
};

export const validateStripeConfig = (config: StripeConfig): void => {
  if (config.mode === 'staging') {
    if (!config.secretKey.startsWith('sk_test_')) {
      throw new Error('Staging mode requires a test secret key (sk_test_...)');
    }
    if (!config.publishableKey.startsWith('pk_test_')) {
      throw new Error('Staging mode requires a test publishable key (pk_test_...)');
    }
  } else {
    if (!config.secretKey.startsWith('sk_live_')) {
      throw new Error('Production mode requires a live secret key (sk_live_...)');
    }
    if (!config.publishableKey.startsWith('pk_live_')) {
      throw new Error('Production mode requires a live publishable key (pk_live_...)');
    }
  }
};

export const getStripePublicConfig = (config: StripeConfig): { mode: StripeMode; publishableKey: string } => ({
  mode: config.mode,
  publishableKey: config.publishableKey,
});




