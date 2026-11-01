import { Code2, Coins, ListChecks, LogOut, Server, type LucideIcon } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router';
import { useAuth } from '../auth/auth-context.ts';
import { BackendStatus } from '../components/BackendStatus.tsx';
import { BrandMark } from '../components/BrandMark.tsx';
import { useCredits } from '../hooks/useCredits.ts';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Only highlight on this exact URL (not on sub-pages such as /jobs/<id>). */
  end?: boolean;
}

/** Every account can do both things, so the menu is grouped by what you want to do. */
const navSections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Use GPUs',
    items: [
      { to: '/new', label: 'New job', icon: Code2, end: true },
      { to: '/jobs', label: 'My jobs', icon: ListChecks },
    ],
  },
  {
    title: 'Share your GPU',
    items: [{ to: '/machines', label: 'My machines', icon: Server }],
  },
  {
    title: 'Account',
    items: [{ to: '/credits', label: 'Credits', icon: Coins }],
  },
];

/** Left navigation bar, as in the mockups. */
export function Sidebar() {
  const { user, logout } = useAuth();
  const { statement } = useCredits();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-sidebar px-3.5 py-5 text-slate-300">
      <div className="flex items-center gap-2.5 px-2 pb-5 text-[17px] font-bold text-white">
        <BrandMark />
        GPU Grid
      </div>

      <nav className="flex flex-col gap-4">
        {navSections.map((section) => (
          <div key={section.title} className="flex flex-col gap-1">
            <div className="px-2.5 pb-0.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              {section.title}
            </div>
            {section.items.map(({ to, label, icon: Icon, end }) => (
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
                {to === '/credits' && statement && (
                  <span className="ml-auto rounded-md bg-white/10 px-1.5 py-0.5 text-xs font-semibold text-white tabular-nums">
                    {statement.balance.toLocaleString('en-US')}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="mt-auto space-y-3 border-t border-white/10 px-2.5 pt-3">
        {user && (
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              {user.isAdmin && <div className="text-[11px] text-slate-500">Administrator</div>}
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
