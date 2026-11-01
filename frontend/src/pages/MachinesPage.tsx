import { Check, Copy, Cpu, KeyRound, Loader2, Plus, Server, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { errorMessage } from '../api/http.ts';
import { createMachine, deleteMachine, type Machine } from '../api/machines.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useMachines } from '../hooks/useMachines.ts';
import { formatRelativeTime } from '../lib/format.ts';

/** A machine just registered, with the token we may show only now. */
interface NewMachine {
  id: string;
  name: string;
  token: string;
}

export function MachinesPage() {
  const { machines, error, reload } = useMachines();
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<NewMachine | null>(null);

  const online = machines?.filter((m) => m.online) ?? [];
  const busy = online.filter((m) => m.busy).length;
  const gpuCount = online.reduce((sum, m) => sum + m.gpus.length, 0);

  async function handleDelete(machine: Machine) {
    const ok = window.confirm(
      `Remove "${machine.name}"? Its agent will be disconnected and its token stops working.`,
    );
    if (!ok) return;
    try {
      await deleteMachine(machine.id);
      // The token of a machine that no longer exists is useless
      if (created?.id === machine.id) setCreated(null);
      reload();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="My machines"
        subtitle="The GPUs you offer to the grid. You earn credits for every job they run."
        actions={
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
          >
            <Plus className="size-4" />
            Add machine
          </button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="grid grid-cols-4 gap-3">
          <StatCard label="Registered" value={machines?.length ?? 0} />
          <StatCard label="Online" value={online.length} tone="text-emerald-600" />
          <StatCard label="GPUs online" value={gpuCount} />
          <StatCard label="Running a job" value={busy} tone="text-amber-600" />
        </div>

        {created && <TokenNotice machine={created} onClose={() => setCreated(null)} />}

        {error && !machines && <p className="text-sm text-red-600">{error}</p>}

        {!machines && !error && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        )}

        {machines && machines.length === 0 && !created && (
          <NoMachines onAdd={() => setAdding(true)} />
        )}

        {machines && machines.length > 0 && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
            {machines.map((machine) => (
              <MachineCard
                key={machine.id}
                machine={machine}
                onDelete={() => handleDelete(machine)}
              />
            ))}
          </div>
        )}
      </div>

      {adding && (
        <AddMachineDialog
          onClose={() => setAdding(false)}
          onCreated={(machine) => {
            setAdding(false);
            setCreated(machine);
            reload();
          }}
        />
      )}
    </>
  );
}

function MachineCard({ machine, onDelete }: { machine: Machine; onDelete: () => void }) {
  const state = !machine.online ? 'offline' : machine.busy ? 'busy' : 'idle';
  const badge = {
    offline: { label: 'Offline', className: 'bg-slate-100 text-slate-500' },
    busy: { label: 'Busy', className: 'bg-amber-50 text-amber-600' },
    idle: { label: 'Idle', className: 'bg-emerald-50 text-emerald-600' },
  }[state];

  let seen = 'Never connected';
  if (machine.online && machine.connectedAt) {
    seen = `Online since ${formatRelativeTime(machine.connectedAt)}`;
  } else if (machine.lastSeenAt) {
    seen = `Last seen ${formatRelativeTime(machine.lastSeenAt)}`;
  }

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white">
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
        <div className="grid size-9 place-items-center rounded-lg bg-slate-100">
          <Server className="size-4 text-slate-600" />
        </div>
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{machine.name}</h2>
          <p className="text-xs text-slate-500">{seen}</p>
        </div>
        <span
          className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}
        >
          <span className="size-1.5 rounded-full bg-current" />
          {badge.label}
        </span>
      </header>

      <ul className="flex-1 divide-y divide-slate-100">
        {!machine.online && (
          <li className="px-4 py-3 text-sm text-slate-500">
            Start the agent on this machine to offer its GPUs.
          </li>
        )}
        {machine.online && machine.gpus.length === 0 && (
          <li className="px-4 py-3 text-sm text-slate-500">No GPU information reported</li>
        )}
        {machine.gpus.map((gpu, index) => (
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

      <footer className="flex items-center gap-3 border-t border-slate-200 px-4 py-2.5 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1 font-mono" title="Start of its token">
          <KeyRound className="size-3.5" />
          {machine.tokenPrefix}…
        </span>
        {machine.currentJobId && (
          <span>
            Running {/* It may be someone else's job: only show which one it is */}
            <span className="font-mono font-medium text-slate-700">
              {machine.currentJobId.slice(0, 8)}
            </span>
          </span>
        )}
        <button
          type="button"
          onClick={onDelete}
          title="Remove machine"
          aria-label={`Remove ${machine.name}`}
          className="ml-auto rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="size-4" />
        </button>
      </footer>
    </article>
  );
}

function AddMachineDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (machine: NewMachine) => void;
}) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { machine, token } = await createMachine(name.trim());
      onCreated({ id: machine.id, name: machine.name, token });
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        aria-labelledby="add-machine-title"
      >
        <div className="flex items-center">
          <h2 id="add-machine-title" className="font-semibold">
            Add machine
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="size-4" />
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Give it a name you will recognise. You will get a token for its agent.
        </p>

        <label className="mt-4 block text-sm font-medium" htmlFor="machine-name">
          Name
        </label>
        <input
          id="machine-name"
          autoFocus
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Home PC - RTX 3060 Ti"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
        {error && <p className="mt-2 text-sm whitespace-pre-line text-red-600">{error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || name.trim() === ''}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Create token
          </button>
        </div>
      </form>
    </div>
  );
}

/** Shows the token of a new machine. It is the only time it can be seen. */
function TokenNotice({ machine, onClose }: { machine: NewMachine; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const command = `AGENT_TOKEN=${machine.token}`;

  async function copy() {
    await navigator.clipboard.writeText(machine.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 size-5 shrink-0 text-emerald-600" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-emerald-900">"{machine.name}" is registered</h2>
          <p className="mt-0.5 text-sm text-emerald-800">
            Copy its token now: it is shown only once. If you lose it, remove the machine and add it
            again.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-slate-800 ring-1 ring-emerald-200">
              {machine.token}
            </code>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <p className="mt-3 text-sm text-emerald-800">
            On that machine, put it in <code className="font-mono">agent/.env</code> and start the
            agent:
          </p>
          <pre className="mt-1.5 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-slate-200">
            {`# agent/.env\n${command}\n\ncd agent && npm start`}
          </pre>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="I have saved the token"
          title="I have saved the token"
          className="rounded-md p-1 text-emerald-700 hover:bg-emerald-100"
        >
          <X className="size-4" />
        </button>
      </div>
    </section>
  );
}

function NoMachines({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <Cpu className="size-10 text-slate-400" strokeWidth={1.5} />
      <h2 className="mt-4 font-semibold">No machines yet</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Register a machine with an NVIDIA GPU. You will get a token; start the agent there with it
        and the machine will start taking jobs.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600"
      >
        <Plus className="size-4" />
        Add machine
      </button>
    </div>
  );
}
