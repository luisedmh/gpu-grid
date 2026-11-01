import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar.tsx';

/** Shared frame of every page: sidebar on the left, the current page on the right. */
export function AppLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        {/* The page that matches the current URL is rendered here */}
        <Outlet />
      </main>
    </div>
  );
}
