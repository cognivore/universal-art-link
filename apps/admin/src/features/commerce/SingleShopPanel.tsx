import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Button } from '../../components/ui/button';

export type ShopConfig = {
  domain: string;
  name: string;
  description?: string;
  logoUrl?: string;
  storefrontAccessToken?: string;
  featuredCollection?: string;
  cartNote?: string;
};

type SingleShopPanelProps = {
  shop: ShopConfig | null | undefined;
  mutating: boolean;
  onSave: (shop: Partial<ShopConfig>) => Promise<void>;
};

export const SingleShopPanel = ({ shop, mutating, onSave }: SingleShopPanelProps) => {
  const [draft, setDraft] = useState<Partial<ShopConfig>>({
    domain: '',
    name: '',
    description: '',
    logoUrl: '',
    storefrontAccessToken: '',
    featuredCollection: '',
    cartNote: '',
  });

  useEffect(() => {
    if (shop) {
      setDraft({
        domain: shop.domain || '',
        name: shop.name || '',
        description: shop.description || '',
        logoUrl: shop.logoUrl || '',
        storefrontAccessToken: shop.storefrontAccessToken || '',
        featuredCollection: shop.featuredCollection || '',
        cartNote: shop.cartNote || '',
      });
    }
  }, [shop]);

  const handleChange = (field: keyof ShopConfig, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(draft);
  };

  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardDescription className="uppercase tracking-[0.35em] text-xs text-muted-foreground">
          Single-tenant shop
        </CardDescription>
        <CardTitle>Shopify store configuration</CardTitle>
        <CardDescription>
          Connect your Shopify store and products will be fetched live from Shopify Storefront API—no manual sync needed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="shop-domain">Shopify domain *</Label>
            <Input
              id="shop-domain"
              placeholder="your-store.myshopify.com"
              value={draft.domain}
              onChange={(event) => handleChange('domain', event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Your Shopify shop domain (e.g., mystudio.myshopify.com or custom domain)
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop-name">Shop name *</Label>
            <Input
              id="shop-name"
              placeholder="Studio Loom"
              value={draft.name}
              onChange={(event) => handleChange('name', event.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop-description">Description</Label>
            <Textarea
              id="shop-description"
              placeholder="Letterpress prints and workshops…"
              value={draft.description}
              onChange={(event) => handleChange('description', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop-logo">Logo URL</Label>
            <Input
              id="shop-logo"
              placeholder="/assets/logo.svg"
              value={draft.logoUrl}
              onChange={(event) => handleChange('logoUrl', event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop-token">Storefront API access token</Label>
            <Input
              id="shop-token"
              type="password"
              placeholder="Paste your public Storefront API token"
              value={draft.storefrontAccessToken}
              onChange={(event) => handleChange('storefrontAccessToken', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Get this from Shopify Admin → Apps → Develop apps → Storefront API.
              This is a PUBLIC token (safe to store).
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop-collection">Featured collection (optional)</Label>
            <Input
              id="shop-collection"
              placeholder="spring-2025"
              value={draft.featuredCollection}
              onChange={(event) => handleChange('featuredCollection', event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Collection handle to display. Leave empty to show all products.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="shop-note">Cart note</Label>
            <Input
              id="shop-note"
              placeholder="Order via Studio Loom"
              value={draft.cartNote}
              onChange={(event) => handleChange('cartNote', event.target.value)}
            />
          </div>
          <Button type="submit" disabled={mutating}>
            Save shop configuration
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

type ModeTogglePanelProps = {
  isMultiMerchant: boolean;
  mutating: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
};

const ModeTogglePanel = ({ isMultiMerchant, mutating, onToggle }: ModeTogglePanelProps) => {
  const handleToggle = async () => {
    const message = isMultiMerchant
      ? 'Switch to single-tenant mode? This will hide the merchant directory and show a single shop page.'
      : 'Enable multi-merchant marketplace? This will let you manage multiple Shopify stores and their catalogs.';

    if (!window.confirm(message)) return;
    await onToggle(!isMultiMerchant);
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="text-amber-900">Commerce mode</CardTitle>
        <CardDescription className="text-amber-700">
          Current mode: <strong>{isMultiMerchant ? 'Multi-merchant marketplace' : 'Single-tenant shop'}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="mb-4 text-sm text-muted-foreground">
          {isMultiMerchant
            ? 'Multi-merchant mode lets you curate products from multiple Shopify stores in one marketplace.'
            : 'Single-tenant mode fetches products directly from one Shopify store using Storefront API.'}
        </p>
        <Button variant="outline" onClick={handleToggle} disabled={mutating}>
          {isMultiMerchant ? 'Switch to single-tenant mode' : 'Enable multi-merchant mode'}
        </Button>
      </CardContent>
    </Card>
  );
};

