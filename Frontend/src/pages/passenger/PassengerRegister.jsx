import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, UserPlus } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

const initialValues = {
  passengerName: '',
  phone: '',
  email: '',
  password: '',
  confirmPassword: '',
};

function PassengerRegister() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [values, setValues] = useState(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const updateValue = (key, value) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const validate = () => {
    if (!values.passengerName.trim() || !values.phone.trim() || !values.email.trim()) {
      return 'Name, phone, and email are required.';
    }
    if (values.password.length < 6) {
      return 'Password must be at least 6 characters.';
    }
    if (values.password !== values.confirmPassword) {
      return 'Passwords do not match.';
    }
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await register(values);
      setSuccess('Account created. You can login now.');
      setValues(initialValues);
      window.setTimeout(() => navigate('/passenger/login'), 800);
    } catch (registerError) {
      setError(registerError.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto flex min-h-[calc(100vh-10rem)] max-w-lg items-center px-4 py-8">
      <div className="surface-panel w-full p-5 sm:p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          <UserPlus className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="mt-5 text-2xl font-semibold text-ink-950 dark:text-white">
          Create Passenger Account
        </h2>
        <p className="mt-2 text-sm leading-6 text-ink-600 dark:text-ink-300">
          Your account unlocks passenger actions like waiting registration and
          future saved route features.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Passenger name
            </span>
            <input
              value={values.passengerName}
              onChange={(event) => updateValue('passengerName', event.target.value)}
              className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              autoComplete="name"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Phone
            </span>
            <input
              value={values.phone}
              onChange={(event) => updateValue('phone', event.target.value)}
              className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              autoComplete="tel"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Email
            </span>
            <input
              type="email"
              value={values.email}
              onChange={(event) => updateValue('email', event.target.value)}
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
              onChange={(event) => updateValue('password', event.target.value)}
              className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="text-sm font-semibold text-ink-700 dark:text-ink-200">
              Confirm password
            </span>
            <input
              type="password"
              value={values.confirmPassword}
              onChange={(event) =>
                updateValue('confirmPassword', event.target.value)
              }
              className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 dark:border-white/10 dark:bg-ink-950 dark:text-white"
              autoComplete="new-password"
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-200 sm:col-span-2">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-200 sm:col-span-2">
              {success}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="focus-ring inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500 sm:col-span-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            )}
            Create account
          </button>
        </form>

        <p className="mt-5 text-sm text-ink-600 dark:text-ink-300">
          Already registered?{' '}
          <Link
            to="/passenger/login"
            className="font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-200"
          >
            Login
          </Link>
        </p>
      </div>
    </section>
  );
}

export default PassengerRegister;
