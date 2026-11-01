import { Coins, Loader2, Shield, ShieldOff, Trash2, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  getOverview,
  giveCredits,
  listAllJobs,
  listAllMachines,
  listUsers,
  removeMachine,
  setAdmin,
  type AdminUser,
} from '../api/admin.ts';
import { errorMessage } from '../api/http.ts';
import type { JobStatus } from '../api/jobs.ts';
import { useAuth } from '../auth/auth-context.ts';
import { JobStatusBadge } from '../components/JobStatusBadge.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useLiveData } from '../hooks/useLiveData.ts';
import { formatCredits, formatDuration, formatRelativeTime } from '../lib/format.ts';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'users', label: 'Users' },
  { id: 'machines', label: 'Machines' },
  { id: 'jobs', label: 'Jobs' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** The whole platform at a glance, for administrators. */
export function AdminPage() {
  // The open tab lives in the URL (?tab=users), so it survives a reload and can be linked
  const [params, setParams] = useSearchParams();
  const tab: TabId = TABS.some((t) => t.id === params.get('tab'))
    ? (params.get('tab') as TabId)
    : 'overview';

  return (
    <>
      <PageHeader title="Administration" subtitle="Everything happening on the platform" />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        <div className="flex gap-1 self-start rounded-xl bg-slate-200/70 p-1 text-sm font-semibold">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setParams({ tab: t.id })}
              className={`rounded-lg px-4 py-1.5 ${
                tab === t.id ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'overview' && <OverviewTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'machines' && <MachinesTab />}
        {tab === 'jobs' && <JobsTab />}
      </div>
    </>
  );
}

/** Shows a spinner or an error until the data has arrived. */
function Loading({
  data,
  error,
  children,
}: {
  data: unknown;
  error: string | null;
  children: ReactNode;
}) {
  if (data) return children;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  return (
    <div className="flex flex-1 items-center justify-center">
      <Loader2 className="size-6 animate-spin text-slate-400" />
    </div>
  );
}

const STATUS_ORDER: JobStatus[] = [
  'PENDING',
  'COMPILING',
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
  'COMPILE_FAILED',
];

function OverviewTab() {
  const { data, error } = useLiveData(getOverview);

  return (
    <Loading data={data} error={error}>
      {data && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Users" value={data.users} />
            <StatCard
              label="Machines online"
              value={`${data.machines.online} / ${data.machines.registered}`}
              tone="text-emerald-600"
            />
            <StatCard label="Machines busy" value={data.machines.busy} tone="text-amber-600" />
            <StatCard
              label="Jobs waiting or running"
              value={data.jobs.PENDING + data.jobs.COMPILING + data.jobs.QUEUED + data.jobs.RUNNING}
              tone="text-blue-600"
            />
          </div>

          <div className="grid grid-cols-4 gap-3">
            <StatCard
              label="Platform revenue"
              value={formatCredits(data.credits.platformRevenue)}
              tone="text-brand-500"
            />
            <StatCard label="Paid by clients" value={formatCredits(data.credits.paidByClients)} />
            <StatCard
              label="Paid to providers"
              value={formatCredits(data.credits.paidToProviders)}
            />
            <StatCard label="Held in accounts" value={formatCredits(data.credits.inAccounts)} />
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold">Jobs by status</h2>
            <div className="flex flex-wrap gap-x-6 gap-y-3">
              {STATUS_ORDER.map((status) => (
                <div key={status} className="flex items-center gap-2">
                  <JobStatusBadge status={status} />
                  <span className="text-sm font-semibold tabular-nums">{data.jobs[status]}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </Loading>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const { data, error, reload } = useLiveData(listUsers);
  const [crediting, setCrediting] = useState<AdminUser | null>(null);

  async function toggleAdmin(user: AdminUser) {
    const action = user.isAdmin ? 'Remove administrator rights from' : 'Make administrator:';
    if (!window.confirm(`${action} ${user.name}?`)) return;
    try {
      await setAdmin(user.id, !user.isAdmin);
      reload();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  }

  return (
    <Loading data={data} error={error}>
      {data && (
        <Table headers={['User', 'Balance', 'Jobs', 'Machines', 'Joined', '']}>
          {data.map((user) => (
            <tr key={user.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2 font-semibold">
                  {user.name}
                  {user.isAdmin && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-500">
                      Admin
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{user.email}</div>
              </td>
              <td className="px-4 py-3 font-semibold tabular-nums">
                {user.balance.toLocaleString('en-US')}
              </td>
              <td className="px-4 py-3 tabular-nums">{user._count.jobs}</td>
              <td className="px-4 py-3 tabular-nums">{user._count.machines}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                {formatRelativeTime(user.createdAt)}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <IconButton title="Give credits" onClick={() => setCrediting(user)}>
                    <Coins className="size-4" />
                  </IconButton>
                  {user.id !== me?.id && (
                    <IconButton
                      title={user.isAdmin ? 'Remove administrator rights' : 'Make administrator'}
                      onClick={() => toggleAdmin(user)}
                    >
                      {user.isAdmin ? (
                        <ShieldOff className="size-4" />
                      ) : (
                        <Shield className="size-4" />
                      )}
                    </IconButton>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      )}
      {crediting && (
        <GiveCreditsDialog
          user={crediting}
          onClose={() => setCrediting(null)}
          onDone={() => {
            setCrediting(null);
            reload();
          }}
        />
      )}
    </Loading>
  );
}

function GiveCreditsDialog({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState('1000');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await giveCredits(user.id, Number(amount));
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 grid place-items-center bg-slate-950/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        aria-labelledby="give-credits-title"
      >
        <div className="flex items-center">
          <h2 id="give-credits-title" className="font-semibold">
            Give credits to {user.name}
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
          Current balance: {formatCredits(user.balance)}.
        </p>

        <label className="mt-4 block text-sm font-medium" htmlFor="credit-amount">
          Credits to add
        </label>
        <input
          id="credit-amount"
          type="number"
          min={1}
          max={1_000_000}
          step={1}
          required
          autoFocus
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
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
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {saving && <Loader2 className="size-4 animate-spin" />}
            Give credits
          </button>
        </div>
      </form>
    </div>
  );
}

function MachinesTab() {
  const { data, error, reload } = useLiveData(listAllMachines);

  async function handleRemove(id: string, name: string) {
    if (!window.confirm(`Remove "${name}"? Its agent is disconnected and its token stops working.`))
      return;
    try {
      await removeMachine(id);
      reload();
    } catch (err) {
      window.alert(errorMessage(err));
    }
  }

  return (
    <Loading data={data} error={error}>
      {data && (
        <Table headers={['Machine', 'Owner', 'State', 'GPUs', 'Jobs run', 'Last seen', '']}>
          {data.length === 0 && <EmptyRow columns={7} text="No machines registered yet." />}
          {data.map((machine) => (
            <tr key={machine.id} className="border-t border-slate-100">
              <td className="px-4 py-3">
                <div className="font-semibold">{machine.name}</div>
                <div className="font-mono text-[11px] text-slate-400">{machine.tokenPrefix}…</div>
              </td>
              <td className="px-4 py-3">
                <div>{machine.owner.name}</div>
                <div className="text-xs text-slate-500">{machine.owner.email}</div>
              </td>
              <td className="px-4 py-3">
                <MachineState online={machine.online} busy={machine.busy} />
              </td>
              <td className="px-4 py-3 text-xs text-slate-600">
                {machine.gpus.map((gpu) => gpu.name).join(', ') || '—'}
              </td>
              <td className="px-4 py-3 tabular-nums">{machine._count.jobs}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                {machine.online
                  ? 'Now'
                  : machine.lastSeenAt
                    ? formatRelativeTime(machine.lastSeenAt)
                    : 'Never'}
              </td>
              <td className="px-4 py-3 text-right">
                <IconButton
                  title="Remove machine"
                  danger
                  onClick={() => handleRemove(machine.id, machine.name)}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Loading>
  );
}

function JobsTab() {
  const { data, error } = useLiveData(listAllJobs);
  const navigate = useNavigate();

  return (
    <Loading data={data} error={error}>
      {data && (
        <Table headers={['Job', 'Client', 'Machine', 'Status', 'Duration', 'Cost', 'Submitted']}>
          {data.length === 0 && <EmptyRow columns={7} text="No jobs yet." />}
          {data.map((job) => (
            <tr
              key={job.id}
              onClick={() => navigate(`/jobs/${job.id}`)}
              className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
            >
              <td className="px-4 py-3">
                <div className="font-semibold">{job.name}</div>
                <div className="font-mono text-[11px] text-slate-400">{job.id.slice(0, 8)}</div>
              </td>
              <td className="px-4 py-3">{job.client.name}</td>
              <td className="px-4 py-3 text-slate-600">{job.machine?.name ?? '—'}</td>
              <td className="px-4 py-3">
                <JobStatusBadge status={job.status} />
              </td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDuration(job.durationMs)}</td>
              <td className="px-4 py-3 tabular-nums">{job.costCredits ?? '—'}</td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-500">
                {formatRelativeTime(job.createdAt)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Loading>
  );
}

function Table({ headers, children }: { headers: string[]; children: ReactNode }) {
  return (
    <div className="overflow-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            {headers.map((header, index) => (
              <th key={index} className="px-4 py-2.5 font-semibold">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function EmptyRow({ columns, text }: { columns: number; text: string }) {
  return (
    <tr>
      <td colSpan={columns} className="px-4 py-10 text-center text-slate-500">
        {text}
      </td>
    </tr>
  );
}

function MachineState({ online, busy }: { online: boolean; busy: boolean }) {
  const { label, className } = !online
    ? { label: 'Offline', className: 'bg-slate-100 text-slate-500' }
    : busy
      ? { label: 'Busy', className: 'bg-amber-50 text-amber-600' }
      : { label: 'Idle', className: 'bg-emerald-50 text-emerald-600' };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function IconButton({
  title,
  onClick,
  danger = false,
  children,
}: {
  title: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`rounded-md p-1.5 text-slate-400 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
    </button>
  );
}
