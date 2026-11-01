import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as authApi from '../api/auth.ts';
import { SESSION_EXPIRED_EVENT } from '../api/http.ts';
import { realtime } from '../realtime/connection.ts';
import { AuthContext, type AuthState } from './auth-context.ts';

/** Keeps track of who is logged in and shares it with the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<authApi.User | null>(null);
  const [loading, setLoading] = useState(true);

  // On start-up, ask the backend whether the session cookie is still valid
  useEffect(() => {
    void authApi.getCurrentUser().then((current) => {
      setUser(current);
      setLoading(false);
    });
  }, []);

  // Any API call that gets a 401 means the session ended
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
      realtime.stop();
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const loggedIn = await authApi.login(email, password);
    setUser(loggedIn);
    // Reconnect live updates with the new session
    realtime.restart();
    return loggedIn;
  }, []);

  const register = useCallback(async (data: authApi.RegisterData) => {
    const created = await authApi.register(data);
    setUser(created);
    realtime.restart();
    return created;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    realtime.stop();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
