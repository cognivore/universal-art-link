import { test } from 'node:test';
import assert from 'node:assert';
import { buildShopifyCartUrl } from './shopifyCart.js';

test('builds a Shopify cart URL with multiple line items', () => {
  const url = buildShopifyCartUrl(
    'example-shop.myshopify.com',
    [
      { variantId: '123', quantity: 2 },
      { variantId: '456', quantity: 1 },
    ],
  );
  assert.strictEqual(url, 'https://example-shop.myshopify.com/cart/123:2,456:1');
});

test('strips protocol from shop domains and encodes query parameters', () => {
  const url = buildShopifyCartUrl(
    'https://atelier.example',
    [{ variantId: '789', quantity: 3 }],
    { note: 'Order via UAL', extraQuery: { ref: 'ual', cart: 4 } },
  );
  assert.strictEqual(url, 'https://atelier.example/cart/789:3?note=Order+via+UAL&ref=ual&cart=4');
});

test('throws when no items are provided', () => {
  assert.throws(() => buildShopifyCartUrl('shop.test', []), /At least one cart item/);
});

test('validates variant IDs and quantities', () => {
  assert.throws(
    () => buildShopifyCartUrl('shop.test', [{ variantId: 'abc', quantity: 1 }]),
    /Invalid variant ID/,
  );
  assert.throws(
    () => buildShopifyCartUrl('shop.test', [{ variantId: '123', quantity: 0 }]),
    /Invalid quantity/,
  );
});

