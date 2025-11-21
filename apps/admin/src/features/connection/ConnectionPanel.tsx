import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';

export type ConnectionPanelProps = {
  apiAvailable: boolean;
  connecting: boolean;
  onConnect: (payload: { baseUrl: string; secret: string }) => Promise<void>;
};

const STORAGE_KEY = 'ual:last-remote-url';

export const ConnectionPanel = ({ apiAvailable, connecting, onConnect }: ConnectionPanelProps) => {
  const [baseUrl, setBaseUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setBaseUrl(saved);
    }
  }, []);

  const canSubmit = useMemo(() => baseUrl.trim().length > 0 && secret.trim().length > 0 && apiAvailable && !connecting, [apiAvailable, baseUrl, connecting, secret]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await onConnect({ baseUrl: baseUrl.trim(), secret: secret.trim() });
      localStorage.setItem(STORAGE_KEY, baseUrl.trim());
      setSecret('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardDescription className="uppercase tracking-[0.35em] text-xs text-muted-foreground">Universal Artistic Link</CardDescription>
        <CardTitle>Connect to your deploy target</CardTitle>
        <CardDescription>Bring your remote endpoint + shared secret. We keep sensitive data inside <code>.ual/connection.json</code>.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="remote-url">Remote endpoint URL</Label>
            <Input
              id="remote-url"
              type="url"
              autoComplete="url"
              placeholder="https://deploy.example.com"
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="remote-secret">Shared secret</Label>
            <Input
              id="remote-secret"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button className="w-full" disabled={!canSubmit}>
            {connecting ? 'Connecting…' : apiAvailable ? 'Connect' : 'Waiting for admin API'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

