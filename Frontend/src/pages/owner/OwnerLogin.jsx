import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bus, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { useOwnerAuth } from '../../context/OwnerAuthContext.jsx';

export default function OwnerLogin() {
  const { login }    = useOwnerAuth();
  const navigate     = useNavigate();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate('/owner/dashboard');
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-600 shadow-lg shadow-brand-600/30">
            <Bus className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-ink-950 dark:text-white">Owner Login</h1>
          <p className="mt-1 text-sm text-ink-500">Sign in to manage your fleet</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-panel dark:border-white/10 dark:bg-ink-900">
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@example.com"
                  required
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 py-3 pl-10 pr-4 text-sm text-ink-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 dark:border-white/10 dark:bg-ink-800 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-ink-500">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-ink-200 bg-ink-50 py-3 pl-10 pr-4 text-sm text-ink-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 dark:border-white/10 dark:bg-ink-800 dark:text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
