import { ExternalLink, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import { FINAL_STATUSES, type Job } from '../api/jobs.ts';
import { JobStatusBadge } from './JobStatusBadge.tsx';

interface JobConsoleProps {
  job: Job | null;
  error: string | null;
}

/** Console under the editor: compiler messages and the program's output. */
export function JobConsole({ job, error }: JobConsoleProps) {
  const running = job && !FINAL_STATUSES.includes(job.status);

  return (
    <div className="flex h-56 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-2.5 text-sm font-semibold">
        Console
        {running && <Loader2 className="size-4 animate-spin text-slate-400" />}
        <span className="ml-auto flex items-center gap-3 text-xs font-normal text-slate-500">
          {job?.durationMs != null && <span>{(job.durationMs / 1000).toFixed(2)} s</span>}
          {job?.exitCode != null && <span>exit code {job.exitCode}</span>}
          {job && <JobStatusBadge status={job.status} />}
          {job && (
            <Link
              to={`/jobs/${job.id}`}
              className="inline-flex items-center gap-1 font-medium text-brand-500 hover:underline"
            >
              Details
              <ExternalLink className="size-3" />
            </Link>
          )}
        </span>
      </div>
      <pre className="flex-1 overflow-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
        {error && <span className="text-red-400">{error}</span>}
        {!job && !error && (
          <span className="text-slate-500">Press Run to compile and execute your program.</span>
        )}
        {job && <ConsoleLines job={job} />}
      </pre>
    </div>
  );
}

function ConsoleLines({ job }: { job: Job }) {
  return (
    <>
      {job.compilerOutput && (
        <span className={job.status === 'COMPILE_FAILED' ? 'text-red-400' : 'text-amber-300'}>
          {job.compilerOutput}
          {'\n'}
        </span>
      )}
      {job.status === 'PENDING' && (
        <span className="text-slate-500">Waiting to compile…{'\n'}</span>
      )}
      {job.status === 'COMPILING' && (
        <span className="text-slate-500">Compiling with nvcc…{'\n'}</span>
      )}
      {job.status === 'QUEUED' && (
        <span className="text-slate-500">Compiled. Waiting for a free GPU…{'\n'}</span>
      )}
      {job.status === 'RUNNING' && <span className="text-slate-500">Running on a GPU…{'\n'}</span>}
      {job.stdout}
      {job.stderr && <span className="text-red-400">{job.stderr}</span>}
    </>
  );
}
