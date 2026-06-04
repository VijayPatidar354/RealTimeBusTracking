import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Loader2, LockKeyhole } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

function PassengerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const redirectTo = location.state?.from?.pathname || '/passenger';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (!values.email.trim() || !values.password) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      await login(values);
      navigate(redirectTo, { replace: true });
    } catch (loginError) {
      setError(loginError.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-md items-center px-4 py-8">
      <div className="surface-panel w-full p-5 sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          <LockKeyhole className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-ink-950 dark:text-white">
          Passenger Login
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
          Sign in to use passenger-only actions while keeping live route search
          and tracking available.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Email
            </span>
            <input
              type="email"
              value={values.email}
              onChange={(event) =>
                setValues((current) => ({ ...current, email: event.target.value }))
              }
              className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Password
            </span>
            <input
              type="password"
              value={values.password}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              autoComplete="current-password"
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            )}
            Login
          </button>
        </form>

        <p className="mt-5 text-sm text-ink-600 dark:text-ink-300">
          New passenger?{' '}
          <Link
            to="/passenger/register"
            className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-200"
          >
            Create an account
          </Link>
        </p>
      </div>
    </section>
  );
}

export default PassengerLogin;
