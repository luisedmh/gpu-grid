import { Cpu, Loader2, Server } from 'lucide-react';
import { Link } from 'react-router';
import type { Agent } from '../api/agents.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useAgents } from '../hooks/useAgents.ts';
import { formatRelativeTime } from '../lib/format.ts';

export function ProvidersPage() {
  const { agents, error } = useAgents();

  const gpuCount = agents?.reduce((sum, agent) => sum + agent.gpus.length, 0) ?? 0;
  const busy = agents?.filter((agent) => agent.busy).length ?? 0;

  return (
    <>
      <PageHeader title="Providers" subtitle="Machines currently offering their GPUs" />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Machines online" value={agents?.length ?? 0} />
          <StatCard label="GPUs available" value={gpuCount} />
          <StatCard label="Busy" value={busy} tone="text-amber-600" />
          <StatCard label="Idle" value={(agents?.length ?? 0) - busy} tone="text-emerald-600" />
        </div>

        {error && !agents && <p className="text-sm text-red-600">{error}</p>}

        {!agents && !error && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        )}

        {agents && agents.length === 0 && <NoProviders />}

        {agents && agents.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-lg bg-slate-100">
          <Server className="size-4 text-slate-600" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{agent.name}</h2>
          <p className="text-xs text-slate-500">
            Connected {formatRelativeTime(agent.connectedAt)}
          </p>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            agent.busy ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {agent.busy ? 'Busy' : 'Idle'}
        </span>
      </header>

      <ul className="divide-y divide-slate-100">
        {agent.gpus.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">No GPU information reported</li>
        )}
        {agent.gpus.map((gpu, index) => (
          <li key={index} className="flex items-center gap-3 px-4 py-3">
            <Cpu className="size-4 shrink-0 text-brand-500" />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{gpu.name}</div>
              <div className="text-xs text-slate-500">
                {(gpu.memoryMb / 1024).toFixed(0)} GB · compute capability {gpu.computeCapability}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <footer className="border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        {agent.currentJobId ? (
          <>
            Running{' '}
            <Link
              to={`/jobs/${agent.currentJobId}`}
              className="font-mono font-medium text-brand-500 hover:underline"
            >
              {agent.currentJobId.slice(0, 8)}
            </Link>
          </>
        ) : (
          'Waiting for jobs'
        )}
      </footer>
    </article>
  );
}

function NoProviders() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <Cpu className="size-10 text-slate-400" strokeWidth={1.5} />
      <h2 className="mt-4 font-semibold">No providers connected</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Start the agent on a machine with an NVIDIA GPU and it will appear here. Jobs wait in the
        queue until a provider is available.
      </p>
      <pre className="mt-4 rounded-lg bg-slate-950 px-4 py-2.5 text-left font-mono text-xs text-slate-200">
        cd agent && npm start
      </pre>
    </div>
  );
}
