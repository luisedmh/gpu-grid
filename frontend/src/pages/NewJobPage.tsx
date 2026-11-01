import { Code2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState.tsx';
import { PageHeader } from '../components/PageHeader.tsx';

export function NewJobPage() {
  return (
    <>
      <PageHeader title="New job" subtitle="Write or upload your CUDA program and run it" />
      <div className="flex flex-1 p-6">
        <EmptyState
          icon={Code2}
          title="Code editor coming soon"
          description="Here you will write CUDA code, choose the time limit and send it to a GPU."
        />
      </div>
    </>
  );
}
