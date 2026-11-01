import { Link } from 'react-router';
import { homePathFor, useAuth } from '../auth/auth-context.ts';
import { PageHeader } from '../components/PageHeader.tsx';

export function NotFoundPage() {
  const { user } = useAuth();
  const home = user ? homePathFor(user.role) : '/login';
  return (
    <>
      <PageHeader title="Page not found" />
      <div className="p-6 text-sm text-slate-600">
        This page does not exist.{' '}
        <Link to={home} className="font-medium text-brand-500 hover:underline">
          Go to the main page
        </Link>
      </div>
    </>
  );
}
