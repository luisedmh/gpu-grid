interface StatCardProps {
  label: string;
  value: number | string;
  /** Optional colour for the number, e.g. text-red-600 */
  tone?: string;
}

/** A small box with a figure, as in the mockups' summary row. */
export function StatCard({ label, value, tone = 'text-slate-900' }: StatCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold tracking-tight ${tone}`}>{value}</div>
    </div>
  );
}
