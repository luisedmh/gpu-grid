import { ListChecks } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function JobsPage() {
  return (
    <>
      <PageHeader title="My jobs" subtitle="Status and results of everything you have submitted" />
      <div className="flex flex-1 p-6">
        <EmptyState
          icon={ListChecks}
          title="No jobs to show yet"
          description="Your jobs will appear here, updated in real time while they compile and run."
        />
      </div>
    </>
  );
}
