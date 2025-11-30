import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getRuntimeConfig } from '../../lib/runtime-config';
import {
  checkPromotion,
  promoteAll,
  type PromotionCheck,
  type PromotionResult,
  type PromotionStepResult,
} from '../../lib/admin-api';

type PromotionState = 'idle' | 'checking' | 'promoting' | 'done' | 'error';

const StepBadge = ({ step }: { step: PromotionStepResult }) => {
  const colors = step.success
    ? 'bg-emerald-100 text-emerald-800'
    : 'bg-red-100 text-red-800';

  const icon = step.success ? '✓' : '✗';

  return (
    <div className={`rounded-lg border p-3 ${step.success ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-lg ${step.success ? 'text-emerald-600' : 'text-red-600'}`}>{icon}</span>
        <span className="font-medium capitalize">{step.step}</span>
        <Badge variant="outline" className={colors}>
          {step.success ? 'Success' : 'Failed'}
        </Badge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{step.message}</p>
      {step.details && step.details.length > 0 && (
        <div className="mt-2">
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Show {step.details.length} items
            </summary>
            <ul className="mt-1 max-h-32 overflow-auto rounded bg-white/50 p-2">
              {step.details.map((detail, i) => (
                <li key={i} className="font-mono text-muted-foreground">{detail}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </div>
  );
};

export const PromotionPanel = () => {
  const [state, setState] = useState<PromotionState>('idle');
  const [check, setCheck] = useState<PromotionCheck | null>(null);
  const [result, setResult] = useState<PromotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check promotion status once on mount
  useEffect(() => {
    const runCheck = async () => {
      try {
        setState('checking');
        setError(null);
        const config = getRuntimeConfig();
        const checkResult = await checkPromotion(config);
        setCheck(checkResult);
        setState('idle');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to check promotion status');
        setState('error');
      }
    };
    void runCheck();
  }, []); // Empty deps = run once on mount

  const handlePromote = async () => {
    if (!window.confirm(
      'Are you sure you want to promote staging to production?\n\n' +
      'This will:\n' +
      '• Copy all content (pages, products, config) to production\n' +
      '• Copy all assets to production\n' +
      '• Export products to Stripe live mode\n\n' +
      'This action cannot be undone!'
    )) {
      return;
    }

    try {
      setState('promoting');
      setError(null);
      setResult(null);
      const config = getRuntimeConfig();
      const promotionResult = await promoteAll(config);
      setResult(promotionResult);
      setState('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Promotion failed');
      setState('error');
    }
  };

  const isReady = check?.valid && state !== 'promoting';

  return (
    <Card className="bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">🚀</span>
          Staging → Production
        </CardTitle>
        <CardDescription>
          Promote your staging content and products to the production environment.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Environment Check */}
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <span className="font-medium">Environment Status</span>
              {check && (
                <p className={`text-sm ${check.valid ? 'text-emerald-600' : 'text-red-600'}`}>
                  {check.message}
                </p>
              )}
              {state === 'checking' && (
                <p className="text-sm text-muted-foreground">Checking...</p>
              )}
            </div>
            <Badge
              variant="outline"
              className={check?.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}
            >
              {check?.valid ? 'Ready' : 'Not Ready'}
            </Badge>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Promotion Result */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-medium">Promotion Result</span>
              <Badge
                variant="outline"
                className={result.success ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}
              >
                {result.success ? 'Completed' : 'Completed with issues'}
              </Badge>
            </div>
            <div className="space-y-2">
              {result.steps.map((step) => (
                <StepBadge key={step.step} step={step} />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Completed at {new Date(result.timestamp).toLocaleString()}
            </p>
          </div>
        )}

        {/* What Will Happen */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-medium text-slate-800">What Gets Promoted</h4>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <span className="text-blue-500">📄</span>
              <strong>Content:</strong> Pages, commerce config, site settings
            </li>
            <li className="flex items-center gap-2">
              <span className="text-purple-500">🖼️</span>
              <strong>Assets:</strong> Images, SVGs, media files
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">💳</span>
              <strong>Products:</strong> Stripe products (created in live mode if needed)
            </li>
          </ul>
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <strong>Note:</strong> Admin users and secrets are NOT promoted. These must be managed separately.
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={handlePromote}
          disabled={!isReady}
          className="w-full"
          size="lg"
        >
          {state === 'promoting' ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Promoting...
            </span>
          ) : (
            'Promote to Production'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};

