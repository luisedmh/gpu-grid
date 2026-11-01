import { request } from './http.ts';

export type Role = 'CLIENT' | 'PROVIDER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  role: 'CLIENT' | 'PROVIDER';
}

/** Who is logged in, or null if nobody is. */
export async function getCurrentUser(): Promise<User | null> {
  try {
    return await request<User>('/api/auth/me');
  } catch {
    return null;
  }
}

export function login(email: string, password: string) {
  return request<User>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function register(data: RegisterData) {
  return request<User>('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

export function logout() {
  return request<void>('/api/auth/logout', { method: 'POST' });
}
