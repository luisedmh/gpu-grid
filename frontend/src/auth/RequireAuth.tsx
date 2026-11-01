import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import type { Role } from '../api/auth.ts';
import { homePathFor, useAuth } from './auth-context.ts';

interface RequireAuthProps {
  children: ReactNode;
  /** If given, only these roles may see the page. */
  roles?: Role[];
}

/** Protects a page: sends visitors to the login page, and users to their home if not allowed. */
export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!user) {
    // Remember where they were going, to return there after logging in
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homePathFor(user.role)} replace />;
  }
  return children;
}
