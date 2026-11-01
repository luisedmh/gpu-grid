import { Navigate, Route, Routes } from 'react-router';
import { HOME_PATH, useAuth } from './auth/auth-context.ts';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { AppLayout } from './layout/AppLayout.tsx';
import { AdminPage } from './pages/AdminPage.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
import { CreditsPage } from './pages/CreditsPage.tsx';
import { JobsPage } from './pages/JobsPage.tsx';
import { MachinesPage } from './pages/MachinesPage.tsx';
import { NewJobPage } from './pages/NewJobPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

/** Which page is shown for each URL, and who may see it. */
export default function App() {
  return (
    <Routes>
      <Route path="login" element={<AuthPage mode="login" />} />
      <Route path="register" element={<AuthPage mode="register" />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="new" element={<NewJobPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="jobs/:jobId" element={<JobsPage />} />
        <Route path="machines" element={<MachinesPage />} />
        <Route path="credits" element={<CreditsPage />} />
        <Route
          path="admin"
          element={
            <RequireAuth adminOnly>
              <AdminPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** "/" sends users to the main page. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? HOME_PATH : '/login'} replace />;
}
