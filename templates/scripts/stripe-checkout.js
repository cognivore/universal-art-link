/**
 * Stripe Checkout Client
 *
 * Handles checkout flow for Stripe products when running in --single-tenant-stripe mode.
 * Products are loaded from the embedded JSON data and checkout is initiated via the backend API.
 */

const StripeCheckout = (() => {
  // Get embedded commerce data
  const getCommerceData = () => {
    const script = document.getElementById('ual-stripe-data');
    if (!script) {
      console.warn('[Stripe] No embedded commerce data found');
      return null;
    }
    try {
      return JSON.parse(script.textContent || '{}');
    } catch (error) {
      console.error('[Stripe] Failed to parse commerce data:', error);
      return null;
    }
  };

  // Format price for display
  const formatPrice = (amountCents, currency = 'USD') => {
    const amount = amountCents / 100;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  // Create checkout session and redirect
  const checkout = async (productId, quantity = 1, customerEmail = null) => {
    try {
      const payload = {
        productId,
        quantity,
        successUrl: `${window.location.origin}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: window.location.href,
      };
      if (customerEmail) {
        payload.customerEmail = customerEmail;
      }

      const response = await fetch('/__ual/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Checkout failed');
      }

      const session = await response.json();

      // Redirect to Stripe Checkout
      if (session.url) {
        window.location.href = session.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (error) {
      console.error('[Stripe] Checkout error:', error);
      alert(`Checkout failed: ${error.message}`);
    }
  };

  // Initialize product cards with checkout buttons
  const initProductCards = () => {
    const cards = document.querySelectorAll('[data-stripe-product]');

    cards.forEach((card) => {
      const productId = card.dataset.stripeProduct;
      const quantityInput = card.querySelector('[data-quantity-input]');
      const checkoutButton = card.querySelector('[data-checkout-button]');

      if (!checkoutButton) return;

      checkoutButton.addEventListener('click', async (event) => {
        event.preventDefault();
        const quantity = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;

        checkoutButton.disabled = true;
        checkoutButton.textContent = 'Processing...';

        try {
          await checkout(productId, quantity);
        } finally {
          checkoutButton.disabled = false;
          checkoutButton.textContent = 'Buy now';
        }
      });
    });
  };

  // Render product catalog
  const renderCatalog = (container, products) => {
    if (!container) return;

    if (!products || products.length === 0) {
      container.innerHTML = `
        <div class="commerce-empty">
          <h3>No products available</h3>
          <p class="measure">Check back soon for new offerings.</p>
        </div>
      `;
      return;
    }

    const activeProducts = products.filter((p) => p.isActive);

    const html = activeProducts.map((product) => {
      const imageHtml = product.imageUrl
        ? `<div class="commerce-item-card__media">
            <img src="${product.imageUrl}" alt="${product.name}" loading="lazy" />
          </div>`
        : '';

      const priceDisplay = formatPrice(product.priceAmountCents, product.currency);
      const intervalLabel = product.type === 'subscription' && product.interval
        ? ` / ${product.interval}`
        : '';

      const typeLabel = product.type === 'subscription'
        ? '<span class="commerce-item-card__badge">Subscription</span>'
        : '';

      return `
        <article class="commerce-item-card" data-stripe-product="${product.id}">
          ${imageHtml}
          <div class="commerce-item-card__body">
            <div class="commerce-item-card__intro">
              <h3>${product.name}</h3>
              <span class="commerce-item-card__price">${priceDisplay}${intervalLabel}</span>
              ${typeLabel}
            </div>
            ${product.description ? `<p class="measure">${product.description}</p>` : ''}
            <div class="commerce-item-card__actions">
              ${product.type === 'one_time' ? `
                <label class="commerce-item-card__quantity">
                  <span class="micro-label">Quantity</span>
                  <input type="number" min="1" value="1" data-quantity-input />
                </label>
              ` : ''}
              <button class="btn btn--solid" type="button" data-checkout-button>
                ${product.type === 'subscription' ? 'Subscribe' : 'Buy now'}
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('\n');

    container.innerHTML = `<div class="commerce-item-grid__items">${html}</div>`;

    // Initialize checkout buttons after rendering
    initProductCards();
  };

  // Load products from API and render
  const loadAndRenderProducts = async (container) => {
    if (!container) return;

    container.innerHTML = `
      <div class="commerce-loading">
        <p class="measure">Loading products...</p>
      </div>
    `;

    try {
      const response = await fetch('/__ual/api/stripe/products');
      if (!response.ok) {
        throw new Error('Failed to load products');
      }
      const data = await response.json();
      renderCatalog(container, data.products);
    } catch (error) {
      console.error('[Stripe] Failed to load products:', error);
      container.innerHTML = `
        <div class="commerce-empty">
          <h3>Unable to load products</h3>
          <p class="measure">Please try again later.</p>
        </div>
      `;
    }
  };

  // Initialize on DOMContentLoaded
  const init = () => {
    // Initialize any existing product cards (from static rendering)
    initProductCards();

    // Check for dynamic catalog container
    const catalogContainer = document.querySelector('[data-stripe-catalog]');
    if (catalogContainer) {
      loadAndRenderProducts(catalogContainer);
    }
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose public API
  return {
    checkout,
    formatPrice,
    getCommerceData,
    renderCatalog,
    loadAndRenderProducts,
  };
})();

// Make available globally
window.StripeCheckout = StripeCheckout;

