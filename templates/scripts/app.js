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
  if (!commerceData || !Array.isArray(commerceData.merchants)) {
    return;
  }

  const cart = createCartStore();
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

