import { useState, useEffect, useCallback } from 'react';
import {
  fetchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  fetchOrders,
  type StripeProduct,
  type StripeProductInput,
  type StripeProductPatch,
  type OrderRecord,
} from '../../lib/stripe-api';

export type StripeCommerceState = {
  products: StripeProduct[];
  orders: OrderRecord[];
  publishableKey: string;
  loading: boolean;
  error: string | null;
  mutating: boolean;
};

export type StripeCommerceActions = {
  refresh: () => Promise<void>;
  createProduct: (input: StripeProductInput) => Promise<StripeProduct>;
  updateProduct: (productId: string, patch: StripeProductPatch) => Promise<StripeProduct>;
  deleteProduct: (productId: string) => Promise<void>;
  refreshOrders: () => Promise<void>;
};

export const useStripeCommerce = () => {
  const [state, setState] = useState<StripeCommerceState>({
    products: [],
    orders: [],
    publishableKey: '',
    loading: true,
    error: null,
    mutating: false,
  });

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      const data = await fetchProducts();
      setState((prev) => ({
        ...prev,
        products: data.products,
        publishableKey: data.publishableKey,
        loading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: err instanceof Error ? err.message : 'Failed to load products',
        loading: false,
      }));
    }
  }, []);

  const refreshOrders = useCallback(async () => {
    try {
      const data = await fetchOrders({ limit: 50 });
      setState((prev) => ({ ...prev, orders: data.orders }));
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    }
  }, []);

  const handleCreateProduct = useCallback(
    async (input: StripeProductInput): Promise<StripeProduct> => {
      setState((prev) => ({ ...prev, mutating: true }));
      try {
        const product = await createProduct(input);
        setState((prev) => ({
          ...prev,
          products: [...prev.products, product],
          mutating: false,
        }));
        return product;
      } catch (err) {
        setState((prev) => ({ ...prev, mutating: false }));
        throw err;
      }
    },
    []
  );

  const handleUpdateProduct = useCallback(
    async (productId: string, patch: StripeProductPatch): Promise<StripeProduct> => {
      setState((prev) => ({ ...prev, mutating: true }));
      try {
        const product = await updateProduct(productId, patch);
        setState((prev) => ({
          ...prev,
          products: prev.products.map((p) => (p.id === productId ? product : p)),
          mutating: false,
        }));
        return product;
      } catch (err) {
        setState((prev) => ({ ...prev, mutating: false }));
        throw err;
      }
    },
    []
  );

  const handleDeleteProduct = useCallback(async (productId: string): Promise<void> => {
    setState((prev) => ({ ...prev, mutating: true }));
    try {
      await deleteProduct(productId);
      setState((prev) => ({
        ...prev,
        products: prev.products.filter((p) => p.id !== productId),
        mutating: false,
      }));
      setSelectedProductId(null);
    } catch (err) {
      setState((prev) => ({ ...prev, mutating: false }));
      throw err;
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshOrders();
  }, [refresh, refreshOrders]);

  const selectedProduct = state.products.find((p) => p.id === selectedProductId) ?? null;

  return {
    state,
    selectedProduct,
    selectProduct: setSelectedProductId,
    actions: {
      refresh,
      createProduct: handleCreateProduct,
      updateProduct: handleUpdateProduct,
      deleteProduct: handleDeleteProduct,
      refreshOrders,
    } satisfies StripeCommerceActions,
  };
};


