import { Cpu } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function ProvidersPage() {
  return (
    <>
      <PageHeader title="Providers" subtitle="Machines currently offering their GPUs" />
      <div className="flex flex-1 p-6">
        <EmptyState
          icon={Cpu}
          title="Provider list coming soon"
          description="Connected machines, their GPUs and whether they are busy will be listed here."
        />
      </div>
    </>
  );
}
