import { createContext, useContext } from 'react';
import type { RegisterData, Role, User } from '../api/auth.ts';

export interface AuthState {
  /** The logged-in user, or null. */
  user: User | null;
  /** True while we still do not know whether someone is logged in. */
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: RegisterData) => Promise<User>;
  logout: () => Promise<void>;
}

/**
 * A React context makes a value available to every component below its provider,
 * without passing it down through each component's props.
 */
export const AuthContext = createContext<AuthState | null>(null);

/** Access the logged-in user and the login/logout functions from any component. */
export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('useAuth must be used inside <AuthProvider>');
  return auth;
}

/** Page each role lands on after logging in. */
export function homePathFor(role: Role): string {
  return role === 'PROVIDER' ? '/providers' : '/new';
}
