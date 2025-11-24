import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Store, ShoppingCart, Waypoints, BadgePercent } from 'lucide-react';
import { getRuntimeConfig } from '../../lib/runtime-config';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Badge } from '../../components/ui/badge';
import { cn } from '../../lib/utils';
import { useCommerce } from './useCommerce';
import { SingleShopPanel } from './SingleShopPanel';
import { ModeTogglePanel } from './ModeTogglePanel';
import type { CommerceCatalog, ItemPatch, ItemPayload, MerchantPatch, MerchantPayload } from '../../lib/commerce-api';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const merchantDefaults: MerchantPayload = {
  name: '',
  slug: '',
  shopDomain: '',
  logoUrl: '',
  description: '',
  isActive: true,
};

const itemDefaults: ItemPayload = {
  merchantId: '',
  title: '',
  description: '',
  imageUrl: '',
  shopifyVariantId: '',
  displayPrice: '',
  sortOrder: 0,
  isActive: true,
};

type DraftCatalog = {
  heroTitle: string;
  heroBody: string;
  heroCtaLabel: string;
  heroCtaHref: string;
  emptyTitle: string;
  emptyBody: string;
};

const defaultCatalogDraft: DraftCatalog = {
  heroTitle: '',
  heroBody: '',
  heroCtaLabel: 'Browse catalog',
  heroCtaHref: '/merchants',
  emptyTitle: 'No merchants yet',
  emptyBody: 'Use the admin wizard to activate your first merchant.',
};

export const CommerceSuite = () => {
  const runtimeConfig = useMemo(() => getRuntimeConfig(), []);
  const commerce = useCommerce(runtimeConfig);

  if (commerce.state.loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-3xl border border-dashed bg-white/60">
        <p className="text-muted-foreground">Loading commerce suite…</p>
      </div>
    );
  }

  const isMultiMerchant = commerce.state.enableMultiMerchant ?? false;

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-2">
        <p className="uppercase tracking-[0.35em] text-xs text-muted-foreground">Commerce Suite</p>
        <h1 className="text-3xl font-semibold">
          {isMultiMerchant ? 'Multi-merchant marketplace' : 'Shopify storefront'}
        </h1>
        <p className="text-muted-foreground">
          {isMultiMerchant
            ? 'Manage multiple merchants and their offerings in a unified marketplace.'
            : 'Connect your Shopify store and display products with live pricing from Shopify Storefront API.'}
        </p>
      </header>

      {commerce.state.status ? (
        <div
          className={cn(
            'rounded-2xl border px-4 py-2 text-sm',
            commerce.state.status.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800',
            commerce.state.status.variant === 'error' && 'border-red-200 bg-red-50 text-red-700',
            commerce.state.status.variant === 'muted' && 'border-muted bg-muted/30 text-muted-foreground',
          )}
        >
          {commerce.state.status.message}
        </div>
      ) : null}

      {commerce.state.error ? (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Commerce API unavailable</CardTitle>
            <CardDescription className="text-red-600">{commerce.state.error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => commerce.actions.refresh()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isMultiMerchant ? (
        <>
          <CommerceWizard wizard={commerce.wizard} />

          <div className="grid gap-6 xl:grid-cols-[360px,1fr]">
            <MerchantPanel
              state={commerce.state}
              selectedMerchant={commerce.selectedMerchant}
              onSelect={commerce.actions.selectMerchant}
              onCreate={commerce.actions.createMerchant}
              onUpdate={commerce.actions.updateMerchant}
              onDelete={commerce.actions.deleteMerchant}
              mutating={commerce.state.mutating}
            />
            <ItemPanel
              selectedMerchant={commerce.selectedMerchant}
              items={commerce.itemsForSelectedMerchant}
              onCreate={commerce.actions.createItem}
              onUpdate={commerce.actions.updateItem}
              onDelete={commerce.actions.deleteItem}
              mutating={commerce.state.mutating}
            />
          </div>

          <CatalogPanel
            catalog={commerce.state.catalog}
            onSave={commerce.actions.saveCatalog}
            mutating={commerce.state.mutating}
          />
        </>
      ) : (
        <SingleShopPanel
          shop={commerce.state.shop}
          onSave={commerce.actions.saveShop}
          mutating={commerce.state.mutating}
        />
      )}

      <ModeTogglePanel
        isMultiMerchant={isMultiMerchant}
        onToggle={commerce.actions.toggleMode}
        mutating={commerce.state.mutating}
      />
    </div>
  );
};

type WizardProps = {
  wizard: {
    shopifyReady: boolean;
    merchantReady: boolean;
    itemsReady: boolean;
    launchReady: boolean;
  };
};

const CommerceWizard = ({ wizard }: WizardProps) => {
  const steps = [
    {
      id: 1,
      title: 'Start with Shopify',
      icon: <Store className="h-5 w-5" />,
      complete: wizard.shopifyReady,
      body: [
        'Create a Shopify account or log in as the merchant.',
        'Create at least one product and variant—copy the numeric variant IDs.',
        'Decide which domain you will use (e.g., mystudio.myshopify.com).',
      ],
      action: () => window.open('https://www.shopify.com/signup', '_blank'),
      actionLabel: 'Open Shopify guide',
    },
    {
      id: 2,
      title: 'Register merchant in UAL',
      icon: <Sparkles className="h-5 w-5" />,
      complete: wizard.merchantReady,
      body: [
        'Use the form below to add name, slug, and shop domain.',
        'Upload a logo or paste an asset URL for the card grid.',
        'Keep “Active” enabled to expose the merchant publicly.',
      ],
    },
    {
      id: 3,
      title: 'Map Shopify items & services',
      icon: <ShoppingCart className="h-5 w-5" />,
      complete: wizard.itemsReady,
      body: [
        'Create catalog items that mirror Shopify variants (print packs, tutoring sessions, etc.).',
        'Paste the numeric Shopify variant ID so we can form cart permalinks.',
        'Use display prices for UI only—Shopify still owns the checkout total.',
      ],
    },
    {
      id: 4,
      title: 'Launch & share',
      icon: <Waypoints className="h-5 w-5" />,
      complete: wizard.launchReady,
      body: [
        'Customize the catalog hero copy and empty-state messaging.',
        'Link to `/merchants` from your site navigation.',
        'Test checkout: add an item, hit “Checkout on Shopify”, and confirm the redirect.',
      ],
    },
  ];

  return (
    <Card className="bg-white/90">
      <CardHeader className="pb-4">
        <CardDescription className="uppercase tracking-[0.35em] text-xs text-muted-foreground">Wizard</CardDescription>
        <CardTitle className="text-2xl">From zero to Shopify-ready catalog</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-4">
        {steps.map((step) => (
          <div
            key={step.id}
            className={cn(
              'rounded-2xl border p-4 text-sm transition',
              step.complete ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-white',
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 font-medium">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black text-white">{step.id}</span>
                {step.icon}
              </div>
              <Badge variant={step.complete ? 'default' : 'outline'}>{step.complete ? 'Done' : 'Pending'}</Badge>
            </div>
            <h3 className="font-semibold">{step.title}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
              {step.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {step.action ? (
              <Button variant="ghost" size="sm" className="mt-3 px-0 text-primary" onClick={step.action}>
                {step.actionLabel}
              </Button>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

type MerchantPanelProps = {
  state: ReturnType<typeof useCommerce>['state'];
  selectedMerchant: ReturnType<typeof useCommerce>['selectedMerchant'];
  mutating: boolean;
  onSelect: (merchantId: string | null) => void;
  onCreate: (payload: typeof merchantDefaults) => Promise<void>;
  onUpdate: (merchantId: string, payload: Partial<typeof merchantDefaults>) => Promise<void>;
  onDelete: (merchantId: string) => Promise<void>;
};

const MerchantPanel = ({
  state,
  selectedMerchant,
  mutating,
  onSelect,
  onCreate,
  onUpdate,
  onDelete,
}: MerchantPanelProps) => {
  const [draft, setDraft] = useState<MerchantPayload>(() => ({ ...merchantDefaults }));

  useEffect(() => {
    if (!selectedMerchant) {
      setDraft({ ...merchantDefaults });
      return;
    }
    setDraft({
      name: selectedMerchant.name,
      slug: selectedMerchant.slug,
      shopDomain: selectedMerchant.shopDomain,
      logoUrl: selectedMerchant.logoUrl ?? '',
      description: selectedMerchant.description ?? '',
      isActive: selectedMerchant.isActive,
    });
  }, [selectedMerchant]);

  const handleInput = (field: keyof MerchantPayload, value: string | boolean) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: MerchantPayload = {
      ...draft,
      logoUrl: draft.logoUrl || undefined,
      description: draft.description || undefined,
    };
    if (selectedMerchant) {
      const patch: MerchantPatch = { ...payload };
      await onUpdate(selectedMerchant.id, patch);
    } else {
      await onCreate(payload);
    }
  };

  const handleDelete = async () => {
    if (!selectedMerchant) return;
    const confirmDelete = window.confirm('Delete this merchant and all of its items?');
    if (!confirmDelete) return;
    await onDelete(selectedMerchant.id);
  };

  const isNew = !selectedMerchant;

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardDescription className="uppercase tracking-[0.35em] text-xs text-muted-foreground">
          Merchant directory
        </CardDescription>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{isNew ? 'Create merchant' : `Editing ${selectedMerchant?.name}`}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onSelect(null);
                setDraft({ ...merchantDefaults });
              }}
            >
            New merchant
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          {state.merchants.length === 0 ? (
            <p className="rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
              No merchants yet. Add your first studio or tutor to unlock the rest of the wizard.
            </p>
          ) : (
            <div className="space-y-2">
              {state.merchants.map((merchant) => {
                const active = selectedMerchant?.id === merchant.id;
                return (
                  <button
                    key={merchant.id}
                    type="button"
                    onClick={() => onSelect(merchant.id)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-2xl border px-3 py-2 text-left text-sm transition',
                      active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                    )}
                  >
                    <div>
                      <p className="font-medium">{merchant.name}</p>
                      <p className="text-xs text-muted-foreground">{merchant.shopDomain}</p>
                    </div>
                    <Badge variant={merchant.isActive ? 'default' : 'outline'}>
                      {merchant.isActive ? 'Active' : 'Hidden'}
                    </Badge>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="merchant-name">Merchant name</Label>
            <Input
              id="merchant-name"
              placeholder="Studio Loom"
              value={draft.name}
              onChange={(event) => {
                const value = event.target.value;
                handleInput('name', value);
                if (!selectedMerchant && !draft.slug) {
                  handleInput('slug', slugify(value));
                }
              }}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant-slug">Slug</Label>
            <Input
              id="merchant-slug"
              placeholder="studio-loom"
              value={draft.slug}
              onChange={(event) => handleInput('slug', slugify(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">Used for URLs like /merchants/studio-loom.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant-domain">Shopify domain</Label>
            <Input
              id="merchant-domain"
              placeholder="studio-loom.myshopify.com"
              value={draft.shopDomain}
              onChange={(event) => handleInput('shopDomain', event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">Plain domain only. We will build cart URLs automatically.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant-logo">Logo URL</Label>
            <Input
              id="merchant-logo"
              placeholder="/assets/studio-logo.svg"
              value={draft.logoUrl}
              onChange={(event) => handleInput('logoUrl', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant-description">Description</Label>
            <Textarea
              id="merchant-description"
              placeholder="Letterpress artist collective offering workshops…"
              value={draft.description}
              onChange={(event) => handleInput('description', event.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={draft.isActive}
              onChange={(event) => handleInput('isActive', event.target.checked)}
              className="h-4 w-4 rounded border border-muted-foreground text-primary focus-visible:outline-primary"
            />
            Visible on site
          </label>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={mutating}>
              {selectedMerchant ? 'Save changes' : 'Create merchant'}
            </Button>
            {selectedMerchant ? (
              <Button type="button" variant="ghost" onClick={handleDelete} disabled={mutating}>
                Delete merchant
              </Button>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

type ItemPanelProps = {
  selectedMerchant: ReturnType<typeof useCommerce>['selectedMerchant'];
  items: ReturnType<typeof useCommerce>['itemsForSelectedMerchant'];
  mutating: boolean;
  onCreate: (merchantId: string, payload: ItemPayload) => Promise<void>;
  onUpdate: (itemId: string, payload: ItemPatch) => Promise<void>;
  onDelete: (itemId: string) => Promise<void>;
};

const ItemPanel = ({ selectedMerchant, items, mutating, onCreate, onUpdate, onDelete }: ItemPanelProps) => {
  const [draft, setDraft] = useState<ItemPayload>(() => ({ ...itemDefaults }));
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setEditingId(null);
    setDraft({ ...itemDefaults, merchantId: selectedMerchant?.id ?? '' });
  }, [selectedMerchant?.id]);

  useEffect(() => {
    if (!editingId) return;
    const item = items.find((entry) => entry.id === editingId);
    if (!item) return;
    setDraft({
      merchantId: item.merchantId,
      title: item.title,
      description: item.description ?? '',
      imageUrl: item.imageUrl ?? '',
      shopifyVariantId: item.shopifyVariantId,
      displayPrice: item.displayPrice ?? '',
      sortOrder: item.sortOrder,
      isActive: item.isActive,
    });
  }, [editingId, items]);

  const handleInput = (field: keyof ItemPayload, value: string | number | boolean) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMerchant) return;
    const basePayload: ItemPayload = {
      merchantId: selectedMerchant.id,
      title: draft.title,
      description: draft.description || undefined,
      imageUrl: draft.imageUrl || undefined,
      shopifyVariantId: draft.shopifyVariantId,
      displayPrice: draft.displayPrice || undefined,
      sortOrder: draft.sortOrder,
      isActive: draft.isActive,
    };
    if (editingId) {
      const { merchantId: _, ...patch } = basePayload;
      await onUpdate(editingId, patch);
    } else {
      await onCreate(selectedMerchant.id, basePayload);
    }
    setEditingId(null);
    setDraft({ ...itemDefaults, merchantId: selectedMerchant.id });
  };

  const handleDelete = async () => {
    if (!editingId) return;
    const confirmed = window.confirm('Remove this item from the catalog?');
    if (!confirmed) return;
    await onDelete(editingId);
    setEditingId(null);
    setDraft({ ...itemDefaults, merchantId: selectedMerchant?.id ?? '' });
  };

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardDescription className="uppercase tracking-[0.35em] text-xs text-muted-foreground">
          Items & services
        </CardDescription>
        <CardTitle>Add Shopify-backed offerings</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {!selectedMerchant ? (
          <p className="rounded-2xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            Select or create a merchant to begin mapping Shopify variants.
          </p>
        ) : (
          <>
            <div className="space-y-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No catalog items yet. Start by mapping a Shopify variant ID below.
                </p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {items.map((item) => {
                    const active = editingId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEditingId(item.id)}
                        className={cn(
                          'rounded-2xl border px-3 py-3 text-left text-sm transition',
                          active ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{item.title}</p>
                          <Badge variant={item.isActive ? 'default' : 'outline'}>
                            {item.isActive ? 'Active' : 'Hidden'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Variant #{item.shopifyVariantId} · {item.displayPrice || 'Price shown at checkout'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="item-title">Item title</Label>
                <Input
                  id="item-title"
                  placeholder="Chromatic Print Pack"
                  value={draft.title}
                  onChange={(event) => handleInput('title', event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-description">Description</Label>
                <Textarea
                  id="item-description"
                  placeholder="Set of three A3 giclée prints pulled from the Meridian archive."
                  value={draft.description}
                  onChange={(event) => handleInput('description', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-image">Image URL</Label>
                <Input
                  id="item-image"
                  placeholder="/assets/print-pack.svg"
                  value={draft.imageUrl}
                  onChange={(event) => handleInput('imageUrl', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-variant">Shopify variant ID</Label>
                <Input
                  id="item-variant"
                  placeholder="48712093813533"
                  value={draft.shopifyVariantId}
                  onChange={(event) => handleInput('shopifyVariantId', event.target.value.replace(/\D/g, ''))}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Copy the numeric variant ID from Shopify (&ldquo;variants&quot; section) — not the product URL.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="item-price">Display price</Label>
                  <Input
                    id="item-price"
                    placeholder="$120"
                    value={draft.displayPrice}
                    onChange={(event) => handleInput('displayPrice', event.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Optional UI-only label. Shopify controls the real price.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item-sort">Sort order</Label>
                  <Input
                    id="item-sort"
                    type="number"
                    value={draft.sortOrder}
                    onChange={(event) => handleInput('sortOrder', Number(event.target.value))}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) => handleInput('isActive', event.target.checked)}
                  className="h-4 w-4 rounded border border-muted-foreground text-primary focus-visible:outline-primary"
                />
                Visible on catalog
              </label>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={mutating}>
                  {editingId ? 'Save item' : 'Add item'}
                </Button>
                {editingId ? (
                  <Button type="button" variant="ghost" onClick={handleDelete} disabled={mutating}>
                    Delete item
                  </Button>
                ) : null}
                {editingId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingId(null);
                      setDraft({ ...itemDefaults, merchantId: selectedMerchant.id });
                    }}
                  >
                    Cancel edit
                  </Button>
                ) : null}
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
};

type CatalogPanelProps = {
  catalog?: CommerceCatalog;
  mutating: boolean;
  onSave: (catalog: CommerceCatalog) => Promise<void>;
};

const CatalogPanel = ({ catalog, mutating, onSave }: CatalogPanelProps) => {
  const [draft, setDraft] = useState<DraftCatalog>(defaultCatalogDraft);

  useEffect(() => {
    setDraft({
      heroTitle: catalog?.hero?.title ?? defaultCatalogDraft.heroTitle,
      heroBody: catalog?.hero?.body ?? defaultCatalogDraft.heroBody,
      heroCtaLabel: catalog?.hero?.ctaLabel ?? defaultCatalogDraft.heroCtaLabel,
      heroCtaHref: catalog?.hero?.ctaHref ?? defaultCatalogDraft.heroCtaHref,
      emptyTitle: catalog?.emptyState?.title ?? defaultCatalogDraft.emptyTitle,
      emptyBody: catalog?.emptyState?.body ?? defaultCatalogDraft.emptyBody,
    });
  }, [catalog]);

  const handleChange = (field: keyof DraftCatalog, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave({
      hero: {
        title: draft.heroTitle,
        body: draft.heroBody,
        ctaLabel: draft.heroCtaLabel,
        ctaHref: draft.heroCtaHref,
      },
      emptyState: {
        title: draft.emptyTitle,
        body: draft.emptyBody,
      },
    });
  };

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardDescription className="uppercase tracking-[0.35em] text-xs text-muted-foreground">
          Catalog messaging
        </CardDescription>
        <CardTitle>Hero + empty-state copy</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-primary" />
              <p className="font-semibold">Hero section</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-title">Title</Label>
              <Input
                id="hero-title"
                placeholder="Neighborhood commerce, powered by Shopify"
                value={draft.heroTitle}
                onChange={(event) => handleChange('heroTitle', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-body">Body</Label>
              <Textarea
                id="hero-body"
                placeholder="Help local studios sell prints and sessions…"
                value={draft.heroBody}
                onChange={(event) => handleChange('heroBody', event.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="hero-cta-label">CTA label</Label>
                <Input
                  id="hero-cta-label"
                  value={draft.heroCtaLabel}
                  onChange={(event) => handleChange('heroCtaLabel', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hero-cta-href">CTA link</Label>
                <Input
                  id="hero-cta-href"
                  value={draft.heroCtaHref}
                  onChange={(event) => handleChange('heroCtaHref', event.target.value)}
                />
                <p className="text-xs text-muted-foreground">Link to /merchants or a section anchor.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border p-4">
            <div className="flex items-center gap-2">
              <BadgePercent className="h-4 w-4 text-primary" />
              <p className="font-semibold">Empty state</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="empty-title">Title</Label>
              <Input
                id="empty-title"
                value={draft.emptyTitle}
                onChange={(event) => handleChange('emptyTitle', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="empty-body">Body</Label>
              <Textarea
                id="empty-body"
                value={draft.emptyBody}
                onChange={(event) => handleChange('emptyBody', event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This copy shows if there are no active merchants yet—help visitors understand what to expect.
              </p>
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={mutating}>
              Save messaging
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

