import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { getSession, logout as logoutApi, type AuthSession } from '../lib/auth-api';
import { isStripeMode } from '../lib/runtime-config';

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  error: string | null;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  requiresAuth: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requiresAuth = isStripeMode();

  const refresh = useCallback(async () => {
    if (!requiresAuth) {
      setSession({ authenticated: true });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await getSession();
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check authentication');
      setSession({ authenticated: false });
    } finally {
      setLoading(false);
    }
  }, [requiresAuth]);

  const logout = useCallback(async () => {
    try {
      await logoutApi();
      setSession({ authenticated: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ session, loading, error, logout, refresh, requiresAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};


