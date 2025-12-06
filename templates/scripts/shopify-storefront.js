/**
 * Shopify Storefront API Client
 *
 * Fetches product data from Shopify's public Storefront API.
 * No backend secrets required - uses public storefront access token.
 */

const createShopifyStorefrontClient = (shopDomain, accessToken) => {
  const apiVersion = '2024-01';
  const endpoint = `https://${shopDomain}/api/${apiVersion}/graphql.json`;

  const query = async (graphqlQuery, variables = {}) => {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Only add token if provided (some stores allow unauthenticated access)
    if (accessToken) {
      headers['X-Shopify-Storefront-Access-Token'] = accessToken;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({ query: graphqlQuery, variables }),
      });

      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }

      const json = await response.json();
      if (json.errors) {
        console.warn('[Shopify] GraphQL errors:', json.errors);
      }
      return json.data;
    } catch (error) {
      console.error('[Shopify] Fetch failed:', error);
      return null;
    }
  };

  return {
    /**
     * Fetch a product by its variant ID (gid://shopify/ProductVariant/123456)
     */
    async getProductByVariantId(variantId) {
      const gid = variantId.includes('gid://') ? variantId : `gid://shopify/ProductVariant/${variantId}`;

      const graphqlQuery = `
        query GetProductVariant($id: ID!) {
          node(id: $id) {
            ... on ProductVariant {
              id
              title
              price {
                amount
                currencyCode
              }
              availableForSale
              quantityAvailable
              product {
                id
                title
                description
                featuredImage {
                  url
                  altText
                }
                availableForSale
              }
            }
          }
        }
      `;

      const data = await query(graphqlQuery, { id: gid });
      return data?.node || null;
    },

    /**
     * Fetch multiple products by variant IDs
     */
    async getProductsByVariantIds(variantIds) {
      const products = await Promise.all(
        variantIds.map((id) => this.getProductByVariantId(id))
      );
      return products.filter(Boolean);
    },

    /**
     * Get products from a specific collection
     */
    async getCollection(handle, first = 20) {
      const graphqlQuery = `
        query GetCollection($handle: String!, $first: Int!) {
          collectionByHandle(handle: $handle) {
            id
            title
            description
            products(first: $first) {
              edges {
                node {
                  id
                  title
                  description
                  availableForSale
                  featuredImage {
                    url
                    altText
                  }
                  variants(first: 10) {
                    edges {
                      node {
                        id
                        title
                        price {
                          amount
                          currencyCode
                        }
                        availableForSale
                        quantityAvailable
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const data = await query(graphqlQuery, { handle, first });
      return data?.collectionByHandle || null;
    },

    /**
     * Get all products (paginated)
     */
    async getProducts(first = 20) {
      const graphqlQuery = `
        query GetProducts($first: Int!) {
          products(first: $first) {
            edges {
              node {
                id
                title
                description
                availableForSale
                featuredImage {
                  url
                  altText
                }
                variants(first: 10) {
                  edges {
                    node {
                      id
                      title
                      price {
                        amount
                        currencyCode
                      }
                      availableForSale
                      quantityAvailable
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const data = await query(graphqlQuery, { first });
      return data?.products?.edges?.map(edge => edge.node) || [];
    },
  };
};

/**
 * Parse Shopify GID to get numeric ID
 * gid://shopify/ProductVariant/123456 -> 123456
 */
const parseShopifyGid = (gid) => {
  if (!gid || typeof gid !== 'string') return null;
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : null;
};

/**
 * Format Shopify price for display
 */
const formatShopifyPrice = (amount, currencyCode = 'USD') => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode,
  });
  return formatter.format(parseFloat(amount));
};









