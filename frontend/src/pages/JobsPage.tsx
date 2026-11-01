import { ListChecks, Loader2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { EmptyState } from '../components/EmptyState.tsx';
import { JobDetail } from '../components/JobDetail.tsx';
import { JobStatusBadge } from '../components/JobStatusBadge.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useJobList } from '../hooks/useJobList.ts';
import { formatDuration, formatRelativeTime } from '../lib/format.ts';

export function JobsPage() {
  // The selected job lives in the URL (/jobs/<id>), so a job can be shared or bookmarked
  const { jobId } = useParams();
  const navigate = useNavigate();
  const { data, error } = useJobList();

  const counts = data?.counts;
  const inProgress = counts
    ? counts.PENDING + counts.COMPILING + counts.QUEUED + counts.RUNNING
    : 0;
  const failed = counts ? counts.COMPILE_FAILED + counts.FAILED + counts.TIMED_OUT : 0;
  const total = counts ? Object.values(counts).reduce((sum, n) => sum + n, 0) : 0;

  return (
    <>
      <PageHeader
        title="My jobs"
        subtitle="Status and results of everything you have submitted"
        actions={
          <Link
            to="/new"
            className="rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            New job
          </Link>
        }
      />

      <div className="flex min-h-0 flex-1 gap-5 p-6">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Total jobs" value={total} />
            <StatCard label="In progress" value={inProgress} tone="text-blue-600" />
            <StatCard label="Completed" value={counts?.COMPLETED ?? 0} tone="text-emerald-600" />
            <StatCard label="Failed" value={failed} tone="text-red-600" />
          </div>

          {error && !data && <p className="text-sm text-red-600">{error}</p>}

          {!data && !error && (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-slate-400" />
            </div>
          )}

          {data && data.jobs.length === 0 && (
            <EmptyState
              icon={ListChecks}
              title="No jobs yet"
              description="Jobs you submit from New job will appear here, with their status and output."
            />
          )}

          {data && data.jobs.length > 0 && (
            <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Job</th>
                    <th className="px-4 py-2.5 font-semibold">Status</th>
                    <th className="px-4 py-2.5 font-semibold">Duration</th>
                    <th className="px-4 py-2.5 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {data.jobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      className={`cursor-pointer border-t border-slate-100 hover:bg-slate-50 ${
                        job.id === jobId ? 'bg-brand-50 hover:bg-brand-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold">{job.name}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {job.id.slice(0, 8)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <JobStatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatDuration(job.durationMs)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                        {formatRelativeTime(job.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {jobId && <JobDetail key={jobId} jobId={jobId} />}
      </div>
    </>
  );
}
