import type { JobStatus } from '../api/jobs.ts';

const STYLES: Record<JobStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-slate-100 text-slate-600' },
  COMPILING: { label: 'Compiling', className: 'bg-blue-50 text-blue-600' },
  COMPILE_FAILED: { label: 'Compilation error', className: 'bg-red-50 text-red-600' },
  QUEUED: { label: 'Queued', className: 'bg-amber-50 text-amber-600' },
  RUNNING: { label: 'Running', className: 'bg-blue-50 text-blue-600' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-50 text-emerald-600' },
  FAILED: { label: 'Failed', className: 'bg-red-50 text-red-600' },
  TIMED_OUT: { label: 'Timed out', className: 'bg-red-50 text-red-600' },
};

/** Coloured pill with the state of a job. */
export function JobStatusBadge({ status }: { status: JobStatus }) {
  const { label, className } = STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
