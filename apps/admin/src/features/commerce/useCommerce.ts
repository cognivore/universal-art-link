import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminRuntimeConfig } from '../../lib/runtime-config';
import {
  CommerceCatalog,
  CommerceItem,
  CommerceMerchant,
  CommerceSnapshot,
  createCommerceItem,
  createCommerceMerchant,
  deleteCommerceItem,
  deleteCommerceMerchant,
  fetchCommerceSnapshot,
  saveCommerceCatalog,
  saveShopConfig,
  toggleMultiMerchantMode,
  updateCommerceItem,
  updateCommerceMerchant,
  type ItemPatch,
  type ItemPayload,
  type MerchantPatch,
  type MerchantPayload,
  type ShopConfig,
} from '../../lib/commerce-api';

type CommerceStatus = { message: string; variant: 'success' | 'error' | 'muted' };

type CommerceState = {
  loading: boolean;
  mutating: boolean;
  error: string | null;
  merchants: CommerceMerchant[];
  items: CommerceItem[];
  catalog?: CommerceCatalog;
  shop?: ShopConfig | null;
  enableMultiMerchant: boolean;
  selectedMerchantId: string | null;
  status: CommerceStatus | null;
};

const initialState: CommerceState = {
  loading: true,
  mutating: false,
  error: null,
  merchants: [],
  items: [],
  catalog: undefined,
  shop: null,
  enableMultiMerchant: false,
  selectedMerchantId: null,
  status: null,
};

const ensureSelectedMerchant = (snapshot: CommerceSnapshot, currentId: string | null): string | null => {
  if (snapshot.merchants.length === 0) {
    return null;
  }
  if (currentId && snapshot.merchants.some((merchant) => merchant.id === currentId)) {
    return currentId;
  }
  return snapshot.merchants[0]?.id ?? null;
};

export const useCommerce = (config: AdminRuntimeConfig) => {
  const [state, setState] = useState<CommerceState>(initialState);

  const hydrate = useCallback(
    async (snapshot?: CommerceSnapshot) => {
      try {
        const data = snapshot ?? (await fetchCommerceSnapshot(config));
        setState((prev) => ({
          ...prev,
          loading: false,
          error: null,
          merchants: data.merchants,
          items: data.items,
          catalog: data.catalog,
          shop: data.shop ?? null,
          enableMultiMerchant: data.enableMultiMerchant ?? false,
          selectedMerchantId: ensureSelectedMerchant(data, prev.selectedMerchantId),
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load commerce data';
        setState((prev) => ({ ...prev, loading: false, error: message, status: { message, variant: 'error' } }));
      }
    },
    [config],
  );

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const setStatus = useCallback((status: CommerceStatus | null) => {
    setState((prev) => ({ ...prev, status }));
  }, []);

  const selectMerchant = useCallback((merchantId: string | null) => {
    setState((prev) => ({ ...prev, selectedMerchantId: merchantId }));
  }, []);

  const withMutation = useCallback(
    async <T,>(operation: () => Promise<T>, successMessage?: string): Promise<T | null> => {
      setState((prev) => ({ ...prev, mutating: true, status: successMessage ? { message: 'Saving…', variant: 'muted' } : prev.status }));
      try {
        const result = await operation();
        if (successMessage) {
          setStatus({ message: successMessage, variant: 'success' });
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Commerce action failed';
        setState((prev) => ({ ...prev, mutating: false, status: { message, variant: 'error' } }));
        return null;
      } finally {
        setState((prev) => ({ ...prev, mutating: false }));
      }
    },
    [setStatus],
  );

  const createMerchant = useCallback(
    async (payload: MerchantPayload) => {
      const merchant = await withMutation(() => createCommerceMerchant(config, payload), 'Merchant saved');
      if (!merchant) return;
      setState((prev) => ({
        ...prev,
        merchants: [...prev.merchants, merchant],
        selectedMerchantId: merchant.id,
      }));
    },
    [config, withMutation],
  );

  const updateMerchantDetails = useCallback(
    async (merchantId: string, payload: MerchantPatch) => {
      const merchant = await withMutation(
        () => updateCommerceMerchant(config, merchantId, payload),
        'Merchant updated',
      );
      if (!merchant) return;
      setState((prev) => ({
        ...prev,
        merchants: prev.merchants.map((entry) => (entry.id === merchant.id ? merchant : entry)),
      }));
    },
    [config, withMutation],
  );

  const removeMerchant = useCallback(
    async (merchantId: string) => {
      const result = await withMutation(() => deleteCommerceMerchant(config, merchantId), 'Merchant removed');
      if (result === null) {
        return;
      }
      setState((prev) => {
        const merchants = prev.merchants.filter((entry) => entry.id !== merchantId);
        const items = prev.items.filter((item) => item.merchantId !== merchantId);
        return {
          ...prev,
          merchants,
          items,
          selectedMerchantId: merchants[0]?.id ?? null,
        };
      });
    },
    [config, withMutation],
  );

  const createItem = useCallback(
    async (merchantId: string, payload: ItemPayload) => {
      const item = await withMutation(
        () => createCommerceItem(config, merchantId, payload),
        'Item added to catalog',
      );
      if (!item) return;
      setState((prev) => ({
        ...prev,
        items: [...prev.items, item],
      }));
    },
    [config, withMutation],
  );

  const updateItem = useCallback(
    async (itemId: string, payload: ItemPatch) => {
      const item = await withMutation(
        () => updateCommerceItem(config, itemId, payload),
        'Item updated',
      );
      if (!item) return;
      setState((prev) => ({
        ...prev,
        items: prev.items.map((entry) => (entry.id === item.id ? item : entry)),
      }));
    },
    [config, withMutation],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      const result = await withMutation(() => deleteCommerceItem(config, itemId), 'Item removed');
      if (result === null) {
        return;
      }
      setState((prev) => ({
        ...prev,
        items: prev.items.filter((item) => item.id !== itemId),
      }));
    },
    [config, withMutation],
  );

  const updateCatalog = useCallback(
    async (payload: CommerceCatalog) => {
      const catalog = await withMutation(() => saveCommerceCatalog(config, payload), 'Catalog message saved');
      if (!catalog) return;
      setState((prev) => ({
        ...prev,
        catalog,
      }));
    },
    [config, withMutation],
  );

  const selectedMerchant = useMemo(
    () => state.merchants.find((merchant) => merchant.id === state.selectedMerchantId) ?? null,
    [state.merchants, state.selectedMerchantId],
  );

  const itemsForSelectedMerchant = useMemo(() => {
    if (!state.selectedMerchantId) {
      return [];
    }
    return state.items
      .filter((item) => item.merchantId === state.selectedMerchantId)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) {
          return a.sortOrder - b.sortOrder;
        }
        return a.title.localeCompare(b.title);
      });
  }, [state.items, state.selectedMerchantId]);

  const wizard = useMemo(() => {
    const hasMerchant = state.merchants.length > 0;
    const hasItems = itemsForSelectedMerchant.length > 0;
    const hasCatalogCopy = Boolean(state.catalog?.hero?.title);
    return {
      shopifyReady: hasMerchant,
      merchantReady: hasMerchant,
      itemsReady: hasItems,
      launchReady: hasMerchant && hasItems && hasCatalogCopy,
    };
  }, [itemsForSelectedMerchant.length, state.catalog?.hero?.title, state.merchants.length]);

  const updateShop = useCallback(
    async (payload: Partial<ShopConfig>) => {
      setState((prev) => ({ ...prev, mutating: true }));
      try {
        const updated = await saveShopConfig(config, payload);
        setState((prev) => ({
          ...prev,
          mutating: false,
          shop: updated,
          status: { message: 'Shop configuration saved', variant: 'success' },
        }));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to save shop config';
        setState((prev) => ({ ...prev, mutating: false, status: { message, variant: 'error' } }));
      }
    },
    [config],
  );

  const toggleMode = useCallback(
    async (enabled: boolean) => {
      setState((prev) => ({ ...prev, mutating: true }));
      try {
        await toggleMultiMerchantMode(config, enabled);
        setState((prev) => ({
          ...prev,
          mutating: false,
          enableMultiMerchant: enabled,
          status: {
            message: `Switched to ${enabled ? 'multi-merchant' : 'single-tenant'} mode`,
            variant: 'success',
          },
        }));
        await hydrate();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to toggle mode';
        setState((prev) => ({ ...prev, mutating: false, status: { message, variant: 'error' } }));
      }
    },
    [config, hydrate],
  );

  return {
    state,
    selectedMerchant,
    itemsForSelectedMerchant,
    wizard,
    actions: {
      refresh: hydrate,
      selectMerchant,
      createMerchant,
      updateMerchant: updateMerchantDetails,
      deleteMerchant: removeMerchant,
      createItem,
      updateItem,
      deleteItem: removeItem,
      saveCatalog: updateCatalog,
      saveShop: updateShop,
      toggleMode,
      setStatus,
    },
  };
};

