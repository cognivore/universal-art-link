import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../api.js';

type Membership = { role: string; tenantId?: string };

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; userId: string; email: string; memberships: Membership[] };

export const useAuth = () => {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    authApi.me()
      .then((user) =>
        setAuth({
          status: 'authenticated',
          userId: user.id,
          email: user.email,
          memberships: (user.memberships ?? []) as Membership[],
        }),
      )
      .catch(() => setAuth({ status: 'unauthenticated' }));
  }, []);

  const login = useCallback(async (email: string) => {
    await authApi.login(email);
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setAuth({ status: 'unauthenticated' });
  }, []);

  return { auth, login, logout };
};
