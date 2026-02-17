import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@ual/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@ual/storage': resolve(__dirname, '../../packages/storage/src/index.ts'),
      '@ual/crdt': resolve(__dirname, '../../packages/crdt/src/index.ts'),
      '@ual/stripe': resolve(__dirname, '../../packages/stripe/src/index.ts'),
      '@ual/provisioning': resolve(__dirname, '../../packages/provisioning/src/index.ts'),
      '@ual/renderer': resolve(__dirname, '../../packages/renderer/src/index.ts'),
      '@ual/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@ual/blocks': resolve(__dirname, '../../packages/blocks/src/index.ts'),
    },
  },
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
