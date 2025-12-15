import { useState } from 'react';
import { AdminShell } from './components/admin/AdminShell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { ContentStudio } from './features/cms/ContentStudio';
import { CommerceSuite } from './features/commerce/CommerceSuite';
import { StripeCommerce } from './features/stripe/StripeCommerce';
import { StagingSettings } from './features/settings/StagingSettings';
import { PromotionPanel } from './features/settings/PromotionPanel';
import { LoginPage } from './features/auth/LoginPage';
import { useAuth } from './hooks/useAuth';
import { isStripeMode, getStripeMode } from './lib/runtime-config';

type AdminView = 'content' | 'commerce' | 'stripe' | 'settings';

const LoadingSpinner = () => (
  <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200">
    <div className="flex items-center gap-3">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-200 border-t-violet-600" />
      <span className="text-lg text-slate-600">Loading...</span>
    </div>
  </div>
);

export const App = () => {
  const { session, loading, requiresAuth } = useAuth();
  const stripeMode = isStripeMode();
  const stripeEnv = getStripeMode();
  const isStaging = stripeEnv === 'staging';
  const isSanta = session?.isSanta ?? false;
  const showSettings = stripeMode && (isSanta || isStaging);
  const [view, setView] = useState<AdminView>(stripeMode ? 'stripe' : 'content');

  // Show loading state while checking auth
  if (loading) {
    return <LoadingSpinner />;
  }

  // Show login page if auth is required and user is not authenticated
  if (requiresAuth && !session?.authenticated) {
    return <LoginPage />;
  }

  return (
    <AdminShell>
      <Tabs value={view} onValueChange={(value) => setView(value as AdminView)} className="flex-1">
        <TabsList className="mb-6 w-full justify-start rounded-2xl bg-white/80 p-1 shadow-sm">
          <TabsTrigger value="content" className="flex-1">
            Content Studio
          </TabsTrigger>
          {!stripeMode && (
            <TabsTrigger value="commerce" className="flex-1">
              Shopify Commerce
            </TabsTrigger>
          )}
          {stripeMode && (
            <TabsTrigger value="stripe" className="flex-1">
              Stripe Commerce
            </TabsTrigger>
          )}
          {showSettings && (
            <TabsTrigger value="settings" className="flex-1">
              <span className="flex items-center gap-1">
                {isSanta && <span>🎅</span>}
                Settings
              </span>
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="content">
          <ContentStudio />
        </TabsContent>
        {!stripeMode && (
          <TabsContent value="commerce">
            <CommerceSuite />
          </TabsContent>
        )}
        {stripeMode && (
          <TabsContent value="stripe">
            <StripeCommerce />
          </TabsContent>
        )}
        {showSettings && (
          <TabsContent value="settings">
            <div className="space-y-6">
              <StagingSettings />
              {isSanta && <PromotionPanel />}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </AdminShell>
  );
};

