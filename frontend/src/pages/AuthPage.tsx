import { Loader2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router';
import { errorMessage } from '../api/http.ts';
import { HOME_PATH, useAuth } from '../auth/auth-context.ts';
import { BrandMark } from '../components/BrandMark.tsx';

type Mode = 'login' | 'register';

/** Login and sign-up screen, as in the mockups. */
export function AuthPage({ mode }: { mode: Mode }) {
  const { user, login, register } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Logged in (already, or just now): go where they were heading, or to their home page
  if (user) return <Navigate to={from ?? HOME_PATH} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      // Once `user` is set, this page re-renders and the redirect above takes over
      if (mode === 'login') await login(email, password);
      else await register({ name, email, password });
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[46%] flex-col bg-sidebar p-14 text-white lg:flex">
        <div className="flex items-center gap-2.5 text-xl font-bold">
          <BrandMark />
          GPU Grid
        </div>
        <div className="mt-auto">
          <h1 className="text-4xl leading-tight font-bold tracking-tight">
            GPU power
            <br />
            when you need it.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-slate-300">
            Run your CUDA programs on other companies&apos; GPUs, or put the hardware you are not
            using to work.
          </p>
          <div className="mt-10 flex gap-10 text-sm text-slate-400">
            <div>
              <div className="text-xl font-bold text-white">Pay per use</div>
              no hardware to buy
            </div>
            <div>
              <div className="text-xl font-bold text-white">Real time</div>
              status and results
            </div>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <div className="mb-7 flex rounded-xl bg-slate-200/70 p-1 text-sm font-semibold">
            <TabLink to="/login" active={mode === 'login'}>
              Log in
            </TabLink>
            <TabLink to="/register" active={mode === 'register'}>
              Create account
            </TabLink>
          </div>

          <h2 className="text-2xl font-bold">
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="mt-1 mb-6 text-sm text-slate-500">
            {mode === 'login'
              ? 'Log in to submit jobs or manage your machines.'
              : 'One account to run your code on GPUs and to offer your own.'}
          </p>

          <div className="space-y-4">
            {mode === 'register' && (
              <Field label="Name" id="name">
                <input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className={inputClass}
                />
              </Field>
            )}
            <Field label="Email" id="email">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className={inputClass}
              />
            </Field>
            <Field label="Password" id="password">
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className={inputClass}
              />
            </Field>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm whitespace-pre-line text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-500 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
          >
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </main>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-500';

function TabLink({ to, active, children }: { to: string; active: boolean; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`flex-1 rounded-lg py-2 text-center ${
        active ? 'bg-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      {children}
    </Link>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-slate-500">
        {label}
      </label>
      {children}
    </div>
  );
}
