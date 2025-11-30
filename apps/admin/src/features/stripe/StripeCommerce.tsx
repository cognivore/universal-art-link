import { useState, useEffect, useCallback } from 'react';
import { CreditCard, Package, Receipt, Plus, Trash2, RefreshCw, Download, Upload, CloudCog } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { ImageUpload } from '../../components/ui/image-upload';
import { cn } from '../../lib/utils';
import { useStripeCommerce } from './useStripeCommerce';
import { useAuth } from '../../hooks/useAuth';
import { getRuntimeConfig, getStripeMode } from '../../lib/runtime-config';
import {
  formatPrice,
  type StripeProduct,
  type StripeProductInput,
  type Currency,
  type ProductType,
  type SubscriptionInterval,
} from '../../lib/stripe-api';
import { getSyncStatus, triggerImportSync, triggerExportSync, type SyncStatus, type SyncResult } from '../../lib/admin-api';

const defaultProductInput: StripeProductInput = {
  name: '',
  description: '',
  imageUrl: '',
  type: 'one_time',
  priceAmountCents: 0,
  currency: 'USD',
  interval: null,
  intervalCount: null,
  isActive: true,
  sortOrder: 0,
};

export const StripeCommerce = () => {
  const { session, logout } = useAuth();
  const stripeMode = getStripeMode();
  const commerce = useStripeCommerce();

  if (commerce.state.loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed bg-white/60">
        <p className="text-muted-foreground">Loading Stripe commerce...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <p className="uppercase tracking-[0.35em] text-xs text-muted-foreground">Stripe Commerce</p>
            <Badge
              variant="outline"
              className={cn(
                stripeMode === 'production'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              )}
            >
              {stripeMode === 'production' ? 'Live Mode' : 'Test Mode'}
            </Badge>
          </div>
          <h1 className="text-3xl font-semibold">Products & Orders</h1>
          <p className="text-muted-foreground">
            Manage your products, subscriptions, and view order history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {session?.user && (
            <span className="text-sm text-muted-foreground">{session.user.email}</span>
          )}
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      {commerce.state.error && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Error</CardTitle>
            <CardDescription className="text-red-600">{commerce.state.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => commerce.actions.refresh()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      <SyncPanel onSyncComplete={commerce.actions.refresh} />

      <div className="grid gap-6 xl:grid-cols-[400px,1fr]">
        <ProductPanel
          products={commerce.state.products}
          selectedProduct={commerce.selectedProduct}
          onSelect={commerce.selectProduct}
          onCreate={commerce.actions.createProduct}
          onUpdate={commerce.actions.updateProduct}
          onDelete={commerce.actions.deleteProduct}
          mutating={commerce.state.mutating}
        />
        <OrdersPanel orders={commerce.state.orders} onRefresh={commerce.actions.refreshOrders} />
      </div>
    </div>
  );
};

// =============================================================================
// Sync Panel Component
// =============================================================================

type SyncPanelProps = {
  onSyncComplete?: () => void;
};

const SyncPanel = ({ onSyncComplete }: SyncPanelProps) => {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState<'import' | 'export' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const config = getRuntimeConfig();

  const fetchStatus = useCallback(async () => {
    try {
      const data = await getSyncStatus(config);
      setStatus(data);
      if (data.lastSync) {
        setLastResult(data.lastSync);
      }
    } catch {
      // Silently fail - sync may not be configured
    }
  }, [config]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  const handleImport = async () => {
    try {
      setSyncing('import');
      setError(null);
      const result = await triggerImportSync(config);
      setLastResult(result);
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setSyncing(null);
    }
  };

  const handleExport = async () => {
    try {
      setSyncing('export');
      setError(null);
      const result = await triggerExportSync(config);
      setLastResult(result);
      onSyncComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setSyncing(null);
    }
  };

  return (
    <Card className="bg-white/90">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CloudCog className="h-5 w-5 text-primary" />
          <CardDescription className="uppercase tracking-[0.35em] text-xs">Stripe Sync</CardDescription>
        </div>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Sync with Stripe Dashboard</CardTitle>
          {status?.cronEnabled && (
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
              Auto-sync enabled
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={syncing !== null}
          >
            {syncing === 'import' ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Importing...
              </span>
            ) : (
              <>
                <Download className="mr-1 h-4 w-4" />
                Import from Stripe
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={syncing !== null}
          >
            {syncing === 'export' ? (
              <span className="flex items-center gap-2">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Exporting...
              </span>
            ) : (
              <>
                <Upload className="mr-1 h-4 w-4" />
                Export to Stripe
              </>
            )}
          </Button>
        </div>

        {lastResult && (
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              Last sync:
              <span className="text-muted-foreground">
                {new Date(lastResult.timestamp).toLocaleString()}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              {lastResult.imported > 0 && (
                <span className="text-emerald-600">+{lastResult.imported} imported</span>
              )}
              {lastResult.updated > 0 && (
                <span className="text-blue-600">{lastResult.updated} updated</span>
              )}
              {lastResult.exported > 0 && (
                <span className="text-purple-600">{lastResult.exported} exported</span>
              )}
              {lastResult.skipped > 0 && (
                <span>{lastResult.skipped} unchanged</span>
              )}
              {lastResult.errors.length > 0 && (
                <span className="text-red-600">{lastResult.errors.length} errors</span>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          <strong>Import:</strong> Fetch products created in Stripe Dashboard into local config.{' '}
          <strong>Export:</strong> Create Stripe products for local products that don't have Stripe IDs yet.
        </p>
      </CardContent>
    </Card>
  );
};

type ProductPanelProps = {
  products: StripeProduct[];
  selectedProduct: StripeProduct | null;
  mutating: boolean;
  onSelect: (productId: string | null) => void;
  onCreate: (input: StripeProductInput) => Promise<StripeProduct>;
  onUpdate: (productId: string, patch: Partial<StripeProductInput>) => Promise<StripeProduct>;
  onDelete: (productId: string) => Promise<void>;
};

const ProductPanel = ({
  products,
  selectedProduct,
  mutating,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: ProductPanelProps) => {
  const [draft, setDraft] = useState<StripeProductInput>({ ...defaultProductInput });
  const [priceInput, setPriceInput] = useState('');

  useEffect(() => {
    if (!selectedProduct) {
      setDraft({ ...defaultProductInput });
      setPriceInput('');
      return;
    }
    setDraft({
      name: selectedProduct.name,
      description: selectedProduct.description,
      imageUrl: selectedProduct.imageUrl ?? '',
      type: selectedProduct.type,
      priceAmountCents: selectedProduct.priceAmountCents,
      currency: selectedProduct.currency,
      interval: selectedProduct.interval,
      intervalCount: selectedProduct.intervalCount,
      isActive: selectedProduct.isActive,
      sortOrder: selectedProduct.sortOrder,
    });
    setPriceInput((selectedProduct.priceAmountCents / 100).toFixed(2));
  }, [selectedProduct]);

  const handleInput = (field: keyof StripeProductInput, value: unknown) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handlePriceChange = (value: string) => {
    setPriceInput(value);
    const cents = Math.round(parseFloat(value || '0') * 100);
    handleInput('priceAmountCents', isNaN(cents) ? 0 : cents);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (selectedProduct) {
        await onUpdate(selectedProduct.id, draft);
      } else {
        await onCreate(draft);
        setDraft({ ...defaultProductInput });
        setPriceInput('');
      }
    } catch (err) {
      console.error('Failed to save product:', err);
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    if (!window.confirm(`Delete "${selectedProduct.name}"?`)) return;
    await onDelete(selectedProduct.id);
  };

  const isEditing = Boolean(selectedProduct);

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" />
          <CardDescription className="uppercase tracking-[0.35em] text-xs">Products</CardDescription>
        </div>
        <div className="flex items-center justify-between">
          <CardTitle>{isEditing ? `Editing ${selectedProduct?.name}` : 'Create product'}</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onSelect(null)}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {products.length > 0 && (
          <div className="space-y-2">
            {products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => onSelect(product.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition',
                  selectedProduct?.id === product.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                )}
              >
                <div>
                  <p className="font-medium">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatPrice(product.priceAmountCents, product.currency)}
                    {product.type === 'subscription' && product.interval && ` / ${product.interval}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={product.type === 'subscription' ? 'default' : 'outline'}>
                    {product.type === 'subscription' ? 'Subscription' : 'One-time'}
                  </Badge>
                  <Badge variant={product.isActive ? 'success' : 'outline'}>
                    {product.isActive ? 'Active' : 'Hidden'}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="product-name">Product name *</Label>
            <Input
              id="product-name"
              placeholder="Print Pack (3x A3)"
              value={draft.name}
              onChange={(e) => handleInput('name', e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="product-description">Description</Label>
            <Textarea
              id="product-description"
              placeholder="Chromatic giclée prints from the Meridian archive..."
              value={draft.description}
              onChange={(e) => handleInput('description', e.target.value)}
            />
          </div>

          <ImageUpload
            label="Product Image"
            value={draft.imageUrl}
            onChange={(url) => handleInput('imageUrl', url)}
            placeholder="/assets/product.png or Stripe CDN URL"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-type">Type</Label>
              <select
                id="product-type"
                value={draft.type}
                onChange={(e) => handleInput('type', e.target.value as ProductType)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="one_time">One-time purchase</option>
                <option value="subscription">Subscription</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product-currency">Currency</Label>
              <select
                id="product-currency"
                value={draft.currency}
                onChange={(e) => handleInput('currency', e.target.value as Currency)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
                <option value="JPY">JPY</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-price">Price *</Label>
              <Input
                id="product-price"
                type="number"
                step="0.01"
                min="0"
                placeholder="120.00"
                value={priceInput}
                onChange={(e) => handlePriceChange(e.target.value)}
                required
              />
            </div>

            {draft.type === 'subscription' && (
              <div className="space-y-2">
                <Label htmlFor="product-interval">Billing interval</Label>
                <select
                  id="product-interval"
                  value={draft.interval ?? 'month'}
                  onChange={(e) => handleInput('interval', e.target.value as SubscriptionInterval)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="day">Daily</option>
                  <option value="week">Weekly</option>
                  <option value="month">Monthly</option>
                  <option value="year">Yearly</option>
                </select>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="product-sort">Sort order</Label>
              <Input
                id="product-sort"
                type="number"
                value={draft.sortOrder}
                onChange={(e) => handleInput('sortOrder', parseInt(e.target.value) || 0)}
              />
            </div>

            <div className="flex items-end pb-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(e) => handleInput('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border border-muted-foreground"
                />
                Active (visible to customers)
              </label>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" disabled={mutating || !draft.name}>
              {isEditing ? 'Save changes' : 'Create product'}
            </Button>
            {isEditing && (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={mutating}>
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

type OrdersPanelProps = {
  orders: Array<{
    id: string;
    productName: string;
    quantity?: number;
    amountCents?: number;
    amountTotalCents?: number;
    currency: string;
    customerEmail?: string | null;
    status: 'pending' | 'completed' | 'failed' | 'refunded';
    type?: ProductType;
    createdAt: string;
    paymentStatus?: string;
  }>;
  onRefresh: () => Promise<void>;
};

const OrdersPanel = ({ orders, onRefresh }: OrdersPanelProps) => {
  const statusColors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    completed: 'bg-emerald-100 text-emerald-800',
    failed: 'bg-red-100 text-red-800',
    refunded: 'bg-slate-100 text-slate-800',
  };

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <CardDescription className="uppercase tracking-[0.35em] text-xs">Orders</CardDescription>
        </div>
        <div className="flex items-center justify-between">
          <CardTitle>Recent orders</CardTitle>
          <Button variant="ghost" size="sm" onClick={onRefresh}>
            <RefreshCw className="mr-1 h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center">
            <CreditCard className="mx-auto h-10 w-10 text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">No orders yet</p>
            <p className="text-xs text-muted-foreground">
              Orders will appear here after customers complete checkout
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {orders.map((order) => {
              const amount = order.amountCents ?? order.amountTotalCents ?? 0;
              const quantity = order.quantity ?? 1;
              return (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-2xl border px-4 py-3"
                >
                  <div>
                    <p className="font-medium">
                      {order.productName}{quantity > 1 ? ` × ${quantity}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.customerEmail ?? 'Guest'} ·{' '}
                      {new Date(order.createdAt).toLocaleDateString()}
                      {order.paymentStatus && order.paymentStatus !== 'paid' && (
                        <span className="ml-1 text-amber-600">({order.paymentStatus})</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      {formatPrice(amount, order.currency as Currency)}
                    </span>
                    <Badge className={statusColors[order.status]}>{order.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

