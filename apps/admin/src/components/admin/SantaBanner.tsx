import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { getStagingBypassState, type StagingBypassState } from '../../lib/auth-api';

type SantaBannerProps = {
  readonly onNavigateSettings?: () => void;
};

const REFRESH_INTERVAL_MS = 60 * 1000;

export const SantaBanner = ({ onNavigateSettings }: SantaBannerProps) => {
  const [state, setState] = useState<StagingBypassState | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchState = async () => {
      try {
        const data = await getStagingBypassState();
        if (!mounted) {
          return;
        }
        setState(data);
      } catch (error) {
        if (!mounted) {
          return;
        }
        // If the endpoint is unavailable (e.g., non-stripe mode), ignore errors silently.
        setState(null);
      }
    };

    void fetchState();
    const interval = window.setInterval(fetchState, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, []);

  if (!state?.enabled) {
    return null;
  }

  const handleNavigate = () => {
    onNavigateSettings?.();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-50 bg-red-600 text-white shadow-lg shadow-red-900/30">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide">
              🎅 Santa Override Active
            </p>
            <p className="text-sm text-white/90">
              Disable Santa bypass in Settings before going live. This banner appears on staging and production while the override is enabled.
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleNavigate}>
              Go to Settings
            </Button>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="h-16" />
    </>
  );
};



