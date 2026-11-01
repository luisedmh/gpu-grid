import { Code2, ListChecks, LogOut, Server, type LucideIcon } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import type { Role } from '../api/auth.ts';
import { useAuth } from '../auth/auth-context.ts';
import { BackendStatus } from '../components/BackendStatus.tsx';
import { BrandMark } from '../components/BrandMark.tsx';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Roles that see this item. */
  roles: Role[];
  /** Only highlight on this exact URL (not on sub-pages such as /jobs/<id>). */
  end?: boolean;
}

const navItems: NavItem[] = [
  { to: '/new', label: 'New job', icon: Code2, roles: ['CLIENT', 'ADMIN'], end: true },
  { to: '/jobs', label: 'My jobs', icon: ListChecks, roles: ['CLIENT', 'ADMIN'] },
  { to: '/machines', label: 'My machines', icon: Server, roles: ['PROVIDER', 'ADMIN'] },
];

const ROLE_LABELS: Record<Role, string> = {
  CLIENT: 'Client',
  PROVIDER: 'Provider',
  ADMIN: 'Administrator',
};

/** Left navigation bar, as in the mockups. Shows only the sections of the user's role. */
export function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar px-3.5 py-5 text-slate-300">
      <div className="flex items-center gap-2.5 px-2 pb-6 text-[17px] font-bold text-white">
        <BrandMark />
        GPU Grid
      </div>

      <nav className="flex flex-col gap-1">
        {navItems
          .filter((item) => user && item.roles.includes(user.role))
          .map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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

      <div className="mt-auto space-y-3 border-t border-white/10 px-2.5 pt-3">
        {user && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</div>
              <div className="truncate text-sm text-white">{user.name}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
        <BackendStatus />
      </div>
    </aside>
  );
}
