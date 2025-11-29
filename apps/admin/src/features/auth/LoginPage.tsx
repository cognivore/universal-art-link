import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Button } from '../../components/ui/button';
import { requestMagicLink } from '../../lib/auth-api';
import { getStripeMode } from '../../lib/runtime-config';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);
  const stripeMode = getStripeMode();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setMessage('');
    setDevLink(null);

    try {
      const response = await requestMagicLink(email);
      setStatus('success');
      setMessage(response.message);
      // In development, show the magic link directly
      if (response._devMagicLink) {
        setDevLink(response._devMagicLink);
      }
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to send magic link');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 p-4">
      <Card className="w-full max-w-md bg-white/95 shadow-xl">
        <CardHeader className="space-y-1 text-center">
          <div className="mb-4 flex items-center justify-center gap-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600" />
            <span className="text-xl font-semibold tracking-tight">UAL Admin</span>
          </div>
          <CardTitle className="text-2xl font-bold">Sign in to continue</CardTitle>
          <CardDescription>
            Enter your email to receive a magic link
          </CardDescription>
          {stripeMode && (
            <div className={`mt-2 inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
              stripeMode === 'production'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-amber-100 text-amber-700'
            }`}>
              {stripeMode === 'production' ? 'Production Mode' : 'Staging Mode (Test Keys)'}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {status === 'success' ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-sm text-emerald-800">{message}</p>
              </div>
              {devLink && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-medium text-amber-800">Development Mode - Magic Link:</p>
                  <a
                    href={devLink}
                    className="block break-all text-xs text-indigo-600 underline hover:text-indigo-800"
                  >
                    {devLink}
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() => window.location.href = devLink}
                  >
                    Click to Sign In
                  </Button>
                </div>
              )}
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStatus('idle');
                  setEmail('');
                  setDevLink(null);
                }}
              >
                Try another email
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  className="h-11"
                />
                <p className="text-xs text-muted-foreground">
                  Only authorized emails in <code className="rounded bg-slate-100 px-1">content/auth/admins.yaml</code> can sign in
                </p>
              </div>

              {status === 'error' && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-sm text-red-700">{message}</p>
                </div>
              )}

              <Button
                type="submit"
                className="h-11 w-full"
                disabled={status === 'loading' || !email}
              >
                {status === 'loading' ? 'Sending...' : 'Send Magic Link'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

