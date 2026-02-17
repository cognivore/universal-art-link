import React, { useState } from 'react';

type Props = {
  readonly onLogin: (email: string) => Promise<void>;
};

export const LoginPage: React.FC<Props> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await onLogin(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send link');
    }
  };

  if (sent) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>Check your email</h1>
          <p>We sent a sign-in link to <strong>{email}</strong></p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>UAL Admin</h1>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            autoFocus
          />
          <button type="submit">Send sign-in link</button>
          {error && <p className="error">{error}</p>}
        </form>
      </div>
    </div>
  );
};
