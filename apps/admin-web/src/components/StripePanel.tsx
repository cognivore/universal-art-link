import React, { useState, useEffect } from 'react';
import { stripeApi, type StripeStatus } from '../api.js';

export const StripePanel: React.FC = () => {
  const [status, setStatus] = useState<StripeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    stripeApi.status()
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setLoading(false));
  }, []);

  const startConnect = async () => {
    try {
      const { url } = await stripeApi.connectStart();
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start connect');
    }
  };

  if (loading) return <div className="panel"><p>Loading Stripe status...</p></div>;

  return (
    <div className="panel">
      <h2>Stripe Integration</h2>

      {error && <p className="error-msg">{error}</p>}

      {status?.connected ? (
        <div className="stripe-connected">
          <div className="status-badge status-badge--success">Connected</div>
          <dl>
            <dt>Mode</dt>
            <dd>{status.mode}</dd>
            {status.accountId && (
              <>
                <dt>Account ID</dt>
                <dd><code>{status.accountId}</code></dd>
              </>
            )}
          </dl>
          <p className="hint">
            Manage your Stripe account at{' '}
            <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">dashboard.stripe.com</a>
          </p>
        </div>
      ) : (
        <div className="stripe-disconnected">
          <p>Stripe is not connected to this site. Connect your Stripe account to accept payments.</p>
          <button type="button" className="btn-primary" onClick={startConnect}>
            Connect Stripe Account
          </button>
          <p className="hint">
            Or configure a <code>STRIPE_SECRET_KEY</code> in the environment for payment-links mode.
          </p>
        </div>
      )}
    </div>
  );
};
