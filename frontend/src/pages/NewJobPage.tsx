import { Play, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ApiError, FINAL_STATUSES, createJob } from '../api/jobs.ts';
import { CodeEditor } from '../components/CodeEditor.tsx';
import { JobConsole } from '../components/JobConsole.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { VECTOR_ADD_EXAMPLE } from '../examples/vector-add.ts';
import { useJob } from '../hooks/useJob.ts';

const TIMEOUT_OPTIONS = [10, 30, 60, 120, 300];

export function NewJobPage() {
  const [fileName, setFileName] = useState('vector_add.cu');
  const [sourceCode, setSourceCode] = useState(VECTOR_ADD_EXAMPLE);
  const [name, setName] = useState('Vector addition');
  const [timeoutSeconds, setTimeoutSeconds] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const { job, error: jobError } = useJob(jobId);
  const fileInput = useRef<HTMLInputElement>(null);

  const busy = submitting || (job !== null && !FINAL_STATUSES.includes(job.status));

  /** Loads a .cu file from the user's computer into the editor. */
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setSourceCode(await file.text());
    setFileName(file.name);
    setName(file.name.replace(/\.cu$/, ''));
    event.target.value = '';
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await createJob({ name, sourceCode, timeoutSeconds });
      setJobId(created.id);
    } catch (err) {
      const details = err instanceof ApiError && err.details.length > 0 ? err.details : null;
      setSubmitError(
        details
          ? details.map((d) => `${d.field}: ${d.message}`).join('\n')
          : (err as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New job"
        subtitle="Write or upload your CUDA program and run it on a GPU"
      />

      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 gap-5 p-6">
        {/* Left: editor and console */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center border-b border-slate-200 px-4 py-2.5">
              <span className="font-mono text-sm font-semibold">{fileName}</span>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
              >
                <Upload className="size-4" />
                Upload file
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".cu,.cpp,.cuh,.h"
                onChange={handleFile}
                className="hidden"
              />
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor value={sourceCode} onChange={setSourceCode} />
            </div>
          </div>

          <JobConsole job={job} error={submitError ?? jobError} />
        </div>

        {/* Right: settings and run button */}
        <aside className="flex w-72 shrink-0 flex-col gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-4 text-sm font-semibold">Settings</h2>

            <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="job-name">
              Job name
            </label>
            <input
              id="job-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              className="mb-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />

            <label className="mb-1.5 block text-xs font-medium text-slate-500" htmlFor="timeout">
              Time limit
            </label>
            <select
              id="timeout"
              value={timeoutSeconds}
              onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
            >
              {TIMEOUT_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds < 60
                    ? `${seconds} seconds`
                    : `${seconds / 60} minute${seconds > 60 ? 's' : ''}`}
                </option>
              ))}
            </select>
          </section>

          <button
            type="submit"
            disabled={busy || sourceCode.trim() === ''}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="size-4" />
            {busy ? 'Running…' : 'Run'}
          </button>

          <p className="text-xs leading-relaxed text-slate-500">
            Your program is compiled with <span className="font-mono">nvcc</span> and runs on a
            provider&apos;s NVIDIA GPU. Whatever it prints appears in the console.
          </p>
        </aside>
      </form>
    </>
  );
}
