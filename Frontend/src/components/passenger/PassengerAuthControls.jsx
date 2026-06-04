import { Link } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';

function PassengerAuthControls() {
  const { isAuthenticated, passenger, logout } = useAuth();

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-2">
        <Link
          to="/passenger/login"
          className="focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100 dark:border-white/10 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-white/10"
        >
          Login
        </Link>
        <Link
          to="/passenger/register"
          className="focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Register
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-44 items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200 sm:inline-flex">
        <UserRound className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{passenger?.email || 'Passenger'}</span>
      </span>
      <button
        type="button"
        onClick={logout}
        className="focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-ink-200 bg-white px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100 dark:border-white/10 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-white/10"
      >
        <LogOut className="h-4 w-4 sm:mr-2" aria-hidden="true" />
        <span className="hidden sm:inline">Logout</span>
      </button>
    </div>
  );
}

export default PassengerAuthControls;
