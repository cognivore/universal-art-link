import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Switch } from '../../components/ui/switch';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getCrawlingState, setCrawling, type CrawlingState } from '../../lib/auth-api';
import { getStripeMode } from '../../lib/runtime-config';

const getSourceLabel = (source: CrawlingState['source']) => {
  switch (source) {
    case 'runtime':
      return 'Changed in session';
    case 'env':
      return 'From environment';
    case 'default':
      return 'Default (blocked)';
  }
};

const getSourceColor = (source: CrawlingState['source']) => {
  switch (source) {
    case 'runtime':
      return 'bg-amber-100 text-amber-800 border-amber-300';
    case 'env':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'default':
      return 'bg-slate-100 text-slate-600 border-slate-300';
  }
};

export const CrawlingSettings = () => {
  const isStaging = getStripeMode() === 'staging';
  const [state, setState] = useState<CrawlingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getCrawlingState();
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

  const handleToggle = async (allowed: boolean) => {
    if (!state) return;

    try {
      setSaving(true);
      setError(null);
      const newState = await setCrawling(allowed);
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
      const newState = await setCrawling(null);
      setState(newState);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset setting');
    } finally {
      setSaving(false);
    }
  };

  // On staging, crawling is always blocked - show info message
  if (isStaging) {
    return (
      <Card className="bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            Search Engine Crawling
          </CardTitle>
          <CardDescription>
            Control whether search engines can index your site.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
            <p className="font-medium">Crawling is always blocked on staging</p>
            <p className="mt-1 text-blue-600">
              This prevents placeholder content from being indexed by search engines.
              Crawling settings are only available on production.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="bg-white/80 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="text-2xl">🤖</span>
            Search Engine Crawling
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-20 rounded-lg bg-slate-100" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          Search Engine Crawling
        </CardTitle>
        <CardDescription>
          Control whether search engines (Google, Bing, etc.) can index your site via robots.txt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between rounded-lg border p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Allow Crawling</span>
              {state && (
                <Badge variant="outline" className={getSourceColor(state.source)}>
                  {getSourceLabel(state.source)}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              When enabled, search engines can index your site. Keep disabled while you have
              placeholder content to avoid it appearing in search results.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Switch
              checked={state?.allowed ?? false}
              onCheckedChange={handleToggle}
              disabled={saving}
            />
          </div>
        </div>

        {state?.source === 'runtime' && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="space-y-1">
              <span className="font-medium text-amber-800">Session Override Active</span>
              <p className="text-sm text-amber-700">
                The crawling setting has been changed during this session. Reset to use the
                environment default (<code className="rounded bg-amber-100 px-1">UAL_ALLOW_CRAWLING</code>).
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={saving}>
              Reset to Default
            </Button>
          </div>
        )}

        <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          <p className="font-medium text-slate-700">Current Status</p>
          <p className="mt-1">
            {state?.allowed ? (
              <>
                <span className="text-green-600">✓ Crawling is enabled.</span> Search engines can
                index your site.
              </>
            ) : (
              <>
                <span className="text-amber-600">⚠ Crawling is blocked.</span> Your site won't
                appear in search results (robots.txt returns Disallow: /).
              </>
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

