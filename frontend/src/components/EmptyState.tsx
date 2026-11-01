import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Placeholder shown when a page has nothing to display yet. */
export function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
      <Icon className="size-10 text-slate-400" strokeWidth={1.5} />
      <h2 className="mt-4 font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
    </div>
  );
}
