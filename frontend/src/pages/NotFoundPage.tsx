import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader.tsx';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <div className="p-6 text-sm text-slate-600">
        This page does not exist.{' '}
        <Link to="/new" className="font-medium text-brand-500 hover:underline">
          Go to New job
        </Link>
      </div>
    </>
  );
}
