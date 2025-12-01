const qs = (selector, scope = document) => scope.querySelector(selector);
const qsa = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const initNavToggle = () => {
  const header = qs('.site-header');
  const toggle = qs('[data-nav-toggle]');
  if (!header || !toggle) return;

  toggle.addEventListener('click', () => {
    const isOpen = header.getAttribute('data-nav-open') === 'true';
    header.setAttribute('data-nav-open', String(!isOpen));
  });
};

const initIntersectAnimations = () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
        }
      });
    },
    { threshold: 0.2 },
  );

  qsa('.section').forEach((section) => observer.observe(section));
};

window.addEventListener('DOMContentLoaded', () => {
  initNavToggle();
  initIntersectAnimations();
  initCommerceSuite();
  initContactForms();
});

const STORAGE_KEY = 'ual:commerce-cart';

const createCartStore = () => {
  const safeParse = () => {
    try {
      const raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return { lines: [] };
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.lines)) {
        return { lines: parsed.lines };
      }
    } catch {
      /* ignore */
    }
    return { lines: [] };
  };

  let state = safeParse();

  const persist = () => {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      /* ignore */
    }
  };

  return {
    getLines: () => state.lines.slice(),
    add(itemId, merchantId, variantId, quantity) {
      if (!itemId || !merchantId || !variantId) return;
      const existing = state.lines.find((line) => line.itemId === itemId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        state.lines.push({ itemId, merchantId, variantId, quantity });
      }
      persist();
    },
    update(itemId, quantity) {
      if (!itemId) return;
      if (quantity <= 0) {
        state.lines = state.lines.filter((line) => line.itemId !== itemId);
      } else {
        const target = state.lines.find((line) => line.itemId === itemId);
        if (target) {
          target.quantity = quantity;
        }
      }
      persist();
    },
    remove(itemId) {
      state.lines = state.lines.filter((line) => line.itemId !== itemId);
      persist();
    },
    removeMerchant(merchantId) {
      state.lines = state.lines.filter((line) => line.merchantId !== merchantId);
      persist();
    },
    prune(commerceData) {
      const validIds = new Set((commerceData.items || []).map((item) => item.id));
      const before = state.lines.length;
      state.lines = state.lines.filter((line) => validIds.has(line.itemId));
      if (before !== state.lines.length) {
        persist();
      }
    },
  };
};

const initCommerceSuite = () => {
  const dataEl = document.getElementById('ual-commerce-data');
  if (!dataEl) return;
  let commerceData = null;
  try {
    commerceData = JSON.parse(dataEl.textContent || '{}');
  } catch (error) {
    console.warn('[UAL] Failed to parse commerce payload', error);
    return;
  }

  const cart = createCartStore();

  // Single-tenant mode
  if (commerceData.mode === 'single-tenant' && commerceData.shop) {
    initSingleTenantShop(commerceData.shop, cart);
    initSingleTenantCart(commerceData.shop, cart);
    return;
  }

  // Multi-merchant mode
  if (!commerceData || !Array.isArray(commerceData.merchants)) {
    return;
  }
  cart.prune(commerceData);
  initAddToCartButtons(commerceData, cart);
  initCartPage(commerceData, cart);
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const showCartToast = (message) => {
  let toast = document.querySelector('[data-cart-toast]');
  if (!toast) {
    toast = document.createElement('div');
    toast.dataset.cartToast = 'true';
    toast.className = 'cart-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add('cart-toast--visible');
  setTimeout(() => {
    toast.classList.remove('cart-toast--visible');
  }, 2000);
};

const initAddToCartButtons = (commerceData, cart) => {
  const buttons = document.querySelectorAll('[data-add-to-cart]');
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.commerce-item-card');
      if (!card) return;
      const itemId = card.getAttribute('data-item-id');
      const merchantId = card.getAttribute('data-merchant-id');
      const variantId = card.getAttribute('data-variant-id');
      const quantityInput = card.querySelector('[data-quantity-input]');
      const quantity = Math.max(1, parseInt(quantityInput?.value ?? '1', 10) || 1);
      const item = commerceData.items.find((entry) => entry.id === itemId);
      const merchant = commerceData.merchants.find((entry) => entry.id === merchantId);
      if (!item || !merchant) {
        alert('This item is no longer available.');
        cart.remove(itemId);
        return;
      }
      cart.add(itemId, merchantId, variantId, quantity);
      if (quantityInput) {
        quantityInput.value = '1';
      }
      showCartToast(`${quantity} × ${item.title} added to cart`);
    });
  });
};

const initCartPage = (commerceData, cart) => {
  const root = document.querySelector('[data-cart-root]');
  if (!root) return;
  const groupsHost = root.querySelector('[data-cart-groups]');
  const emptyState = root.querySelector('[data-cart-empty]');

  const render = () => {
    if (!groupsHost) return;
    const lines = cart.getLines();
    if (!lines.length) {
      groupsHost.innerHTML = '';
      if (emptyState) {
        emptyState.hidden = false;
      }
      return;
    }
    if (emptyState) {
      emptyState.hidden = true;
    }
    const groups = buildMerchantGroups(lines, commerceData);
    groupsHost.innerHTML = groups.map((group) => renderCartGroup(group)).join('');
    attachCartListeners(groupsHost, commerceData, cart, render);
  };

  render();

  // Re-render on storage events (multi-tab sync)
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      render();
    }
  });
};

const buildMerchantGroups = (lines, commerceData) => {
  const map = new Map();
  lines.forEach((line) => {
    const merchant = commerceData.merchants.find((entry) => entry.id === line.merchantId);
    const item = commerceData.items.find((entry) => entry.id === line.itemId);
    if (!merchant || !item) {
      return;
    }
    if (!map.has(merchant.id)) {
      map.set(merchant.id, { merchant, entries: [] });
    }
    map.get(merchant.id).entries.push({ cartLine: line, item });
  });
  return Array.from(map.values());
};

const renderCartGroup = (group) => {
  const lines = group.entries
    .map(({ cartLine, item }) => {
      const price = item.displayPrice || 'Price shown at checkout';
      return `<div class="commerce-cart__line" data-cart-item="${item.id}">
        <div>
          <p class="font-semibold">${escapeHtml(item.title)}</p>
          <p class="text-sm muted">${escapeHtml(price)}</p>
        </div>
        <label class="commerce-item-card__quantity">
          <span class="micro-label">Quantity</span>
          <input type="number" min="1" value="${cartLine.quantity}" data-cart-line-input="${item.id}" />
        </label>
        <button class="btn btn--ghost" type="button" data-remove-line="${item.id}">Remove</button>
      </div>`;
    })
    .join('');

  return `<div class="commerce-cart__group" data-cart-group="${group.merchant.id}">
    <div class="commerce-cart__group-header">
      <div>
        <h3>${escapeHtml(group.merchant.name)}</h3>
        <p class="text-sm muted">${escapeHtml(group.merchant.shopDomain)}</p>
      </div>
      <button class="btn btn--ghost" type="button" data-remove-merchant="${group.merchant.id}">Remove merchant</button>
    </div>
    <div class="commerce-cart__lines">
      ${lines}
    </div>
    <div class="commerce-cart__actions">
      <button class="btn btn--solid" type="button" data-checkout-merchant="${group.merchant.id}">Checkout on Shopify</button>
    </div>
  </div>`;
};

const attachCartListeners = (container, commerceData, cart, rerender) => {
  container.querySelectorAll('[data-cart-line-input]').forEach((input) => {
    input.addEventListener('change', (event) => {
      const target = event.currentTarget;
      const itemId = target.getAttribute('data-cart-line-input');
      const nextQty = Math.max(0, parseInt(target.value, 10) || 0);
      cart.update(itemId, nextQty);
      rerender();
    });
  });

  container.querySelectorAll('[data-remove-line]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const target = event.currentTarget;
      const itemId = target.getAttribute('data-remove-line');
      cart.remove(itemId);
      rerender();
    });
  });

  container.querySelectorAll('[data-remove-merchant]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const merchantId = event.currentTarget.getAttribute('data-remove-merchant');
      cart.removeMerchant(merchantId);
      rerender();
    });
  });

  container.querySelectorAll('[data-checkout-merchant]').forEach((button) => {
    button.addEventListener('click', (event) => {
      const merchantId = event.currentTarget.getAttribute('data-checkout-merchant');
      handleCheckout(merchantId, commerceData, cart);
    });
  });
};

const handleCheckout = (merchantId, commerceData, cart) => {
  const merchant = commerceData.merchants.find((entry) => entry.id === merchantId);
  if (!merchant) {
    showCartToast('This merchant is unavailable.');
    cart.removeMerchant(merchantId);
    return;
  }
  const lines = cart.getLines().filter((line) => line.merchantId === merchantId);
  if (!lines.length) {
    showCartToast('Add items before checking out.');
    return;
  }
  const checkoutLines = lines
    .map((line) => ({
      variantId: String(line.variantId || '').trim(),
      quantity: line.quantity,
    }))
    .filter((entry) => entry.variantId);
  if (!checkoutLines.length) {
    showCartToast('Unable to checkout for this merchant right now.');
    cart.removeMerchant(merchantId);
    return;
  }
  const url = buildShopifyCartUrl(merchant.shopDomain, checkoutLines, {
    note: commerceData.siteTitle ? `Order via ${commerceData.siteTitle}` : undefined,
  });
  window.location.href = url;
};

const buildShopifyCartUrl = (domain, items, options = {}) => {
  const normalized = domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  const payload = items
    .map((line) => {
      const variant = String(line.variantId || '').trim();
      const qty = Math.max(1, line.quantity || 1);
      return `${variant}:${qty}`;
    })
    .join(',');
  const base = `https://${normalized}/cart/${payload}`;
  const params = new URLSearchParams();
  if (options.note) {
    params.set('note', options.note);
  }
  params.set('ref', 'ual');
  const query = params.toString();
  return query ? `${base}?${query}` : base;
};

// Single-tenant shop initialization
const initSingleTenantShop = (shopConfig, cart) => {
  const catalogRoot = document.querySelector('[data-shop-catalog]');
  if (!catalogRoot) return;

  if (!window.createShopifyStorefrontClient) {
    catalogRoot.innerHTML = '<p class="measure">Shopify Storefront API not loaded.</p>';
    return;
  }

  const client = window.createShopifyStorefrontClient(shopConfig.domain, shopConfig.storefrontAccessToken);

  const renderProduct = (product) => {
    if (!product || !product.variants || !product.variants.edges.length) return '';

    const variant = product.variants.edges[0].node;
    const variantId = variant.id.split('/').pop();
    const price = `${variant.price.currencyCode} ${parseFloat(variant.price.amount).toFixed(2)}`;
    const image = product.featuredImage
      ? `<div class="commerce-item-card__media">
          <img src="${escapeHtml(product.featuredImage.url)}" alt="${escapeHtml(product.featuredImage.altText || product.title)}" loading="lazy" />
        </div>`
      : '';

    const availability = !product.availableForSale || !variant.availableForSale
      ? '<span class="commerce-item-card__badge commerce-item-card__badge--soldout">Sold out</span>'
      : variant.quantityAvailable !== undefined && variant.quantityAvailable < 5
        ? `<span class="commerce-item-card__badge commerce-item-card__badge--low">Only ${variant.quantityAvailable} left</span>`
        : '';

    return `<article class="commerce-item-card" data-item-id="${variantId}" data-variant-id="${variantId}" data-shop-product>
      ${image}
      <div class="commerce-item-card__body">
        <div class="commerce-item-card__intro">
          <h3>${escapeHtml(product.title)}</h3>
          <span class="commerce-item-card__price">${escapeHtml(price)}</span>
        </div>
        ${product.description ? `<p class="measure">${escapeHtml(product.description)}</p>` : ''}
        ${availability}
        <div class="commerce-item-card__actions">
          <label class="commerce-item-card__quantity">
            <span class="micro-label">Quantity</span>
            <input type="number" min="1" value="1" data-quantity-input ${!product.availableForSale || !variant.availableForSale ? 'disabled' : ''} />
          </label>
          <button class="btn btn--solid" type="button" data-add-to-cart ${!product.availableForSale || !variant.availableForSale ? 'disabled' : ''}>
            ${product.availableForSale && variant.availableForSale ? 'Add to cart' : 'Sold out'}
          </button>
        </div>
      </div>
    </article>`;
  };

  const loadProducts = async () => {
    catalogRoot.innerHTML = '<div class="commerce-loading"><p class="measure">Loading products…</p></div>';

    try {
      let products;
      if (shopConfig.featuredCollection) {
        const collection = await client.getCollection(shopConfig.featuredCollection);
        products = collection?.products?.edges?.map(edge => edge.node) || [];
      } else {
        products = await client.getProducts(50);
      }

      if (!products || products.length === 0) {
        catalogRoot.innerHTML = '<p class="measure">No products available at this time.</p>';
        return;
      }

      const html = `<div class="commerce-item-grid__items">${products.map(renderProduct).join('\n')}</div>`;
      catalogRoot.innerHTML = html;

      // Wire up add-to-cart for Shopify products
      catalogRoot.querySelectorAll('[data-add-to-cart]').forEach((button) => {
        button.addEventListener('click', () => {
          const card = button.closest('[data-shop-product]');
          if (!card) return;
          const variantId = card.getAttribute('data-variant-id');
          const quantityInput = card.querySelector('[data-quantity-input]');
          const quantity = Math.max(1, parseInt(quantityInput?.value ?? '1', 10) || 1);

          cart.add(variantId, 'single-shop', variantId, quantity);
          if (quantityInput) quantityInput.value = '1';

          const title = card.querySelector('h3')?.textContent || 'Item';
          showCartToast(`${quantity} × ${title} added to cart`);
        });
      });
    } catch (error) {
      console.error('[UAL] Failed to load Shopify products:', error);
      catalogRoot.innerHTML = '<p class="measure">Unable to load products. Please check your Shopify Storefront API configuration.</p>';
    }
  };

  loadProducts();
};

const initSingleTenantCart = (shopConfig, cart) => {
  const root = document.querySelector('[data-cart-root]');
  if (!root) return;
  const groupsHost = root.querySelector('[data-cart-groups]');
  const emptyState = root.querySelector('[data-cart-empty]');
  const noteEl = root.querySelector('[data-cart-note]');

  if (noteEl) {
    noteEl.textContent = 'Review your items below and click checkout to complete your purchase on Shopify.';
  }

  const render = () => {
    if (!groupsHost) return;
    const lines = cart.getLines();

    if (!lines.length) {
      groupsHost.innerHTML = '';
      if (emptyState) emptyState.hidden = false;
      return;
    }

    if (emptyState) emptyState.hidden = true;

    const itemsHtml = lines
      .map(
        (line) => `<div class="commerce-cart__item">
          <div class="commerce-cart__item-details">
            <span class="commerce-cart__item-title">Variant #${escapeHtml(line.variantId)}</span>
          </div>
          <div class="commerce-cart__item-controls">
            <input
              type="number"
              min="1"
              value="${line.quantity}"
              data-cart-quantity="${escapeHtml(line.itemId)}"
              class="commerce-cart__quantity-input"
            />
            <button type="button" class="btn btn--ghost btn--sm" data-cart-remove="${escapeHtml(line.itemId)}">Remove</button>
          </div>
        </div>`
      )
      .join('\n');

    const checkoutUrl = buildShopifyCartUrl(
      shopConfig.domain,
      lines.map((line) => ({ variantId: line.variantId, quantity: line.quantity })),
      { note: shopConfig.cartNote }
    );

    groupsHost.innerHTML = `<div class="commerce-cart__group">
      <div class="commerce-cart__group-header">
        <h3>${escapeHtml(shopConfig.name)}</h3>
      </div>
      <div class="commerce-cart__items">
        ${itemsHtml}
      </div>
      <div class="commerce-cart__group-footer">
        <a href="${escapeHtml(checkoutUrl)}" class="btn btn--solid" target="_blank" rel="noreferrer">
          Checkout on Shopify
        </a>
      </div>
    </div>`;

    attachCartHandlers(cart, render);
  };

  render();

  // Re-render on storage events (multi-tab sync)
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY) {
      render();
    }
  });
};

const attachCartHandlers = (cart, renderFn) => {
  document.querySelectorAll('[data-cart-quantity]').forEach((input) => {
    const itemId = input.getAttribute('data-cart-quantity');
    input.addEventListener('change', () => {
      const qty = Math.max(1, parseInt(input.value, 10) || 1);
      cart.update(itemId, qty);
      renderFn();
    });
  });

  document.querySelectorAll('[data-cart-remove]').forEach((button) => {
    const itemId = button.getAttribute('data-cart-remove');
    button.addEventListener('click', () => {
      cart.remove(itemId);
      renderFn();
    });
  });
};

// ---------------------------------------------------------------------------
// Contact Form Enhancement
// ---------------------------------------------------------------------------

const initContactForms = () => {
  const forms = document.querySelectorAll('[data-contact-form]');
  if (!forms.length) return;

  // Record page load time for spam prevention timing check
  const pageLoadTime = Date.now();

  forms.forEach((form) => {
    // Populate hidden page context fields
    const pageUrlInput = form.querySelector('[data-contact-page-url]');
    const pageTitleInput = form.querySelector('[data-contact-page-title]');
    const loadedAtInput = form.querySelector('[data-contact-loaded-at]');
    if (pageUrlInput) pageUrlInput.value = window.location.href;
    if (pageTitleInput) pageTitleInput.value = document.title;
    if (loadedAtInput) loadedAtInput.value = String(pageLoadTime);

    // Check for URL params indicating a redirect result
    const params = new URLSearchParams(window.location.search);
    const contactResult = params.get('contact');
    if (contactResult) {
      const statusEl = form.querySelector('[data-contact-status]');
      if (statusEl) {
        if (contactResult === 'success') {
          showContactStatus(statusEl, 'success', 'Thank you! Your message has been sent.');
        } else if (contactResult === 'error') {
          showContactStatus(statusEl, 'error', 'Something went wrong. Please try again or email directly.');
        }
      }
      // Clean URL without reloading
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
    }

    // Progressive enhancement: AJAX submission
    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      const submitBtn = form.querySelector('button[type="submit"]');
      const statusEl = form.querySelector('[data-contact-status]');
      const originalText = submitBtn ? submitBtn.textContent : 'Send';

      // Disable form during submission
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';
      }
      hideContactStatus(statusEl);

      // Gather form data as JSON
      const formData = new FormData(form);
      const payload = {};
      for (const [key, value] of formData.entries()) {
        payload[key] = value;
      }

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        if (response.ok && result.success) {
          showContactStatus(statusEl, 'success', 'Thank you! Your message has been sent.');
          form.reset();
          // Re-populate hidden fields after reset
          if (pageUrlInput) pageUrlInput.value = window.location.href;
          if (pageTitleInput) pageTitleInput.value = document.title;
          // Update timestamp for next submission
          if (loadedAtInput) loadedAtInput.value = String(Date.now());
        } else {
          const errorMsg = result.error || 'Something went wrong. Please try again.';
          showContactStatus(statusEl, 'error', errorMsg);
        }
      } catch (error) {
        console.error('[contact] Submission failed:', error);
        showContactStatus(statusEl, 'error', 'Network error. Please check your connection and try again.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalText;
        }
      }
    });
  });
};

const showContactStatus = (el, type, message) => {
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
  el.className = 'contact__form-status';
  el.classList.add(type === 'success' ? 'contact__form-status--success' : 'contact__form-status--error');
};

const hideContactStatus = (el) => {
  if (!el) return;
  el.hidden = true;
  el.textContent = '';
  el.className = 'contact__form-status';
};

