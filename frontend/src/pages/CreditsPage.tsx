import { Coins, Loader2 } from 'lucide-react';
import { Link } from 'react-router';
import type { CreditMovement, CreditMovementType } from '../api/credits.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { useCredits } from '../hooks/useCredits.ts';
import { formatCredits, formatDateTime } from '../lib/format.ts';

/** How each kind of movement reads in the statement. */
const MOVEMENT_LABELS: Record<CreditMovementType, string> = {
  WELCOME: 'Welcome credits',
  GRANT: 'Credits added',
  RESERVE: 'Reserved for',
  REFUND: 'Unused credits returned from',
  EARNING: 'Earned running',
};

export function CreditsPage() {
  const { statement, error } = useCredits();

  return (
    <>
      <PageHeader title="Credits" subtitle="What your jobs cost and what your machines earn" />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-6">
        {error && !statement && <p className="text-sm text-red-600">{error}</p>}

        {!statement && !error && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        )}

        {statement && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <StatCard
                label="Balance"
                value={formatCredits(statement.balance)}
                tone="text-brand-500"
              />
              <StatCard
                label="Price of GPU time"
                value={`${formatCredits(statement.creditsPerGpuSecond)} / s`}
              />
              <StatCard
                label="Provider share of each job"
                value={`${statement.providerSharePercent} %`}
              />
            </div>

            <p className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-600">
              Submitting a job reserves its whole time limit. When it finishes you pay only the
              seconds it used (rounded up) and the rest comes back; jobs that do not compile or that
              no machine can finish cost nothing. When your machines run jobs, you get{' '}
              {statement.providerSharePercent} % of what is paid and the platform keeps the rest.
            </p>

            <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
              <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">
                Movements
              </h2>
              {statement.movements.length === 0 ? (
                <div className="flex flex-col items-center p-10 text-center">
                  <Coins className="size-8 text-slate-400" strokeWidth={1.5} />
                  <p className="mt-3 text-sm text-slate-500">
                    Your credit movements will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Date</th>
                        <th className="px-4 py-2.5 font-semibold">Movement</th>
                        <th className="px-4 py-2.5 text-right font-semibold">Credits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.movements.map((movement) => (
                        <MovementRow key={movement.id} movement={movement} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </>
  );
}

function MovementRow({ movement }: { movement: CreditMovement }) {
  const { job } = movement;
  // Earnings come from jobs run on your machines, usually someone else's: no link to them
  const linkJobs = movement.type !== 'EARNING';
  const positive = movement.amount > 0;

  return (
    <tr className="border-t border-slate-100">
      <td className="px-4 py-3 whitespace-nowrap text-slate-500">
        {formatDateTime(movement.createdAt)}
      </td>
      <td className="px-4 py-3">
        {MOVEMENT_LABELS[movement.type]}
        {job &&
          (linkJobs ? (
            <>
              {' '}
              <Link to={`/jobs/${job.id}`} className="font-medium text-brand-500 hover:underline">
                {job.name}
              </Link>
            </>
          ) : (
            <span className="font-mono text-xs text-slate-500"> job {job.id.slice(0, 8)}</span>
          ))}
      </td>
      <td
        className={`px-4 py-3 text-right font-semibold whitespace-nowrap tabular-nums ${
          positive ? 'text-emerald-600' : 'text-slate-900'
        }`}
      >
        {positive ? '+' : '−'}
        {Math.abs(movement.amount).toLocaleString('en-US')}
      </td>
    </tr>
  );
}
