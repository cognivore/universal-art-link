import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getStagingBypassState, setStagingBypass, type StagingBypassState } from '../../lib/auth-api';
import { useAuth } from '../../hooks/useAuth';
import { getStripeMode } from '../../lib/runtime-config';

export const StagingSettings = () => {
  const { session } = useAuth();
  const isSanta = session?.isSanta ?? false;
  const isStaging = getStripeMode() === 'staging';
  // On staging: any admin can toggle. On production: only Santa can enable.
  const canToggle = isStaging || isSanta;
  const [state, setState] = useState<StagingBypassState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getStagingBypassState();
      setState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchState();
  }, [fetchState]);

  const handleToggle = async (enabled: boolean) => {
    if (!state) return;

    try {
      setSaving(true);
      setError(null);
      const newState = await setStagingBypass(enabled);
      setState(newState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update setting');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);
      setError(null);
      const newState = await setStagingBypass(null);
      setState(newState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset setting');
    } finally {
      setSaving(false);
    }
  };

  const getSourceLabel = (source: StagingBypassState['source']) => {
    switch (source) {
      case 'runtime':
        return 'Runtime Override';
      case 'env':
        return 'Environment Variable';
      case 'default':
        return 'Default';
    }
  };

  const getSourceColor = (source: StagingBypassState['source']) => {
    switch (source) {
      case 'runtime':
        return 'bg-amber-100 text-amber-800';
      case 'env':
        return 'bg-blue-100 text-blue-800';
      case 'default':
        return 'bg-slate-100 text-slate-800';
    }
  };

  if (loading) {
    return (
      <Card className="bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle>Staging Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Loading settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🎅</span>
          Staging Settings
        </CardTitle>
        <CardDescription>
          Configure staging environment behavior. These settings only affect the staging instance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* On production, non-Santa admins can only disable */}
        {!isStaging && !isSanta && state?.enabled && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
            You can disable Santa bypass. Only Santa-authenticated users can re-enable it on production.
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Santa Bypass Mode</span>
              {state && (
                <Badge variant="outline" className={getSourceColor(state.source)}>
                  {getSourceLabel(state.source)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              When enabled, authentication can be bypassed using a special JWT with the <code className="rounded bg-slate-100 px-1">is_santa</code> claim.
              This is used for automated testing.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={state?.enabled ?? false}
              onCheckedChange={handleToggle}
              disabled={saving || (!canToggle && !state?.enabled)}
            />
          </div>
        </div>

        {state?.source === 'runtime' && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="space-y-1">
              <span className="font-medium text-amber-800">Runtime Override Active</span>
              <p className="text-sm text-amber-700">
                The current setting overrides the environment variable. This change will be lost on server restart.
              </p>
            </div>
            {canToggle && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={saving}
              >
                Reset to Default
              </Button>
            )}
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-medium text-slate-800">How Santa Bypass Works</h4>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li>• A special JWT with <code className="rounded bg-white px-1">is_santa: true</code> can bypass normal auth</li>
            <li>• The JWT is generated during deployment and stored in <code className="rounded bg-white px-1">UAL_STAGING_JWT</code></li>
            <li>• E2E tests use this JWT to authenticate without magic links</li>
            <li>• This bypass should <strong>never</strong> be enabled in production</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

