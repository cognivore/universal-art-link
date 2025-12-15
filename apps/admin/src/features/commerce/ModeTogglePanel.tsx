import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';

type ModeTogglePanelProps = {
  isMultiMerchant: boolean;
  mutating: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
};

export const ModeTogglePanel = ({ isMultiMerchant, mutating, onToggle }: ModeTogglePanelProps) => {
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











