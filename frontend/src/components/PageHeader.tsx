import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Optional content on the right, such as buttons. */
  actions?: ReactNode;
}

/** Title bar at the top of every page. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-slate-200 bg-white px-6">
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="ml-auto flex items-center gap-3">{actions}</div>}
    </header>
  );
}
