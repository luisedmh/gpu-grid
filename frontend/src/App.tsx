import { Navigate, Route, Routes } from 'react-router';
import { homePathFor, useAuth } from './auth/auth-context.ts';
import { RequireAuth } from './auth/RequireAuth.tsx';
import { AppLayout } from './layout/AppLayout.tsx';
import { AuthPage } from './pages/AuthPage.tsx';
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
        <Route
          path="new"
          element={
            <RequireAuth roles={['CLIENT', 'ADMIN']}>
              <NewJobPage />
            </RequireAuth>
          }
        />
        <Route
          path="jobs"
          element={
            <RequireAuth roles={['CLIENT', 'ADMIN']}>
              <JobsPage />
            </RequireAuth>
          }
        />
        <Route
          path="jobs/:jobId"
          element={
            <RequireAuth roles={['CLIENT', 'ADMIN']}>
              <JobsPage />
            </RequireAuth>
          }
        />
        <Route
          path="machines"
          element={
            <RequireAuth roles={['PROVIDER', 'ADMIN']}>
              <MachinesPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}

/** "/" sends each user to the main page of their role. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homePathFor(user.role) : '/login'} replace />;
}
