import { Code2, Cpu, ListChecks, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';
import { BackendStatus } from '../components/BackendStatus.tsx';
import { BrandMark } from '../components/BrandMark.tsx';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { to: '/jobs/new', label: 'New job', icon: Code2 },
  { to: '/jobs', label: 'My jobs', icon: ListChecks },
  { to: '/providers', label: 'Providers', icon: Cpu },
];

/** Left navigation bar, as in the mockups. */
export function Sidebar() {
  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar px-3.5 py-5 text-slate-300">
      <div className="flex items-center gap-2.5 px-2 pb-6 text-[17px] font-bold text-white">
        <BrandMark />
        GPU Grid
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                isActive ? 'bg-white/10 text-white' : 'hover:bg-white/5 hover:text-white'
              }`
            }
          >
            <Icon className="size-[18px]" strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-white/10 px-2.5 pt-3">
        <BackendStatus />
      </div>
    </aside>
  );
}
