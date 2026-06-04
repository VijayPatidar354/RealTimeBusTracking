import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus, Clock, MapPin, Route, TicketCheck,
  Loader2, AlertCircle, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { getMyWaiting, getAllRoutes, cancelWaiting } from '../../services/passengerService.js';

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-ink-200 bg-ink-50 py-12 text-center dark:border-white/10 dark:bg-ink-900/50">
      <Icon className="h-10 w-10 text-ink-300 dark:text-ink-600" />
      <div>
        <p className="font-semibold text-ink-700 dark:text-ink-300">{title}</p>
        <p className="mt-1 text-sm text-ink-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

function StatusBadge({ busArrived }) {
  if (busArrived) {
    return (
      <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
        <Bus className="h-3 w-3" /> Bus arrived
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Waiting
    </span>
  );
}

export default function PassengerTrips() {
  const { isAuthenticated, token } = useAuth();

  const [waiting,       setWaiting]       = useState([]);
  const [routes,        setRoutes]        = useState([]);
  const [loadingW,      setLoadingW]      = useState(false);
  const [loadingR,      setLoadingR]      = useState(true);
  const [cancellingId,  setCancellingId]  = useState(null);
  const [toast,         setToast]         = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadWaiting = useCallback(async () => {
    if (!isAuthenticated || !token) return;
    setLoadingW(true);
    try {
      const data = await getMyWaiting({ token });
      setWaiting(data.waiting || []);
    } catch (_) {}
    finally { setLoadingW(false); }
  }, [isAuthenticated, token]);

  const loadRoutes = useCallback(async () => {
    setLoadingR(true);
    try {
      const data = await getAllRoutes();
      setRoutes(data.routes || []);
    } catch (_) {}
    finally { setLoadingR(false); }
  }, []);

  useEffect(() => {
    loadWaiting();
    loadRoutes();
  }, [loadWaiting, loadRoutes]);

  const handleCancel = async (entry) => {
    setCancellingId(entry.id);
    try {
      await cancelWaiting({ waitingId: entry.id, token });
      showToast('Waiting cancelled', 'success');
      setWaiting((prev) => prev.filter((w) => w.id !== entry.id));
    } catch (err) {
      showToast(err.message || 'Could not cancel', 'error');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-brand-500 to-sky-500" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink-950 dark:text-white">My Trips</h2>
            <p className="mt-1 text-sm text-ink-500">Your active waiting registrations and available routes</p>
          </div>
          {isAuthenticated ? (
            <button onClick={loadWaiting} disabled={loadingW} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10">
              <RefreshCw className={`h-3.5 w-3.5 ${loadingW ? 'animate-spin' : ''}`} /> Refresh
            </button>
          ) : null}
        </div>
      </div>

      {/* Active waiting */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <TicketCheck className="h-4 w-4 text-brand-500" />
          <h3 className="text-base font-semibold text-ink-950 dark:text-white">Active Waiting</h3>
          {waiting.length > 0 ? (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {waiting.length}
            </span>
          ) : null}
        </div>

        {!isAuthenticated ? (
          <EmptyState
            icon={TicketCheck}
            title="Login to see your waiting entries"
            description="Register or login to track your bus waiting status"
            action={
              <div className="flex gap-2">
                <Link to="/passenger/login" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Login</Link>
                <Link to="/passenger/register" className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300">Register</Link>
              </div>
            }
          />
        ) : loadingW ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading your waiting entries...
          </div>
        ) : waiting.length === 0 ? (
          <EmptyState
            icon={TicketCheck}
            title="No active waiting"
            description="You are not currently registered as waiting at any stop. Search for a route on the Dashboard to get started."
          />
        ) : (
          <div className="space-y-3">
            {waiting.map((entry) => (
              <div key={entry.id} className="surface-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/10">
                      <MapPin className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-ink-950 dark:text-white">{entry.stop_name}</p>
                      <p className="text-xs text-ink-500">{entry.route_name} · {entry.source} → {entry.destination}</p>
                    </div>
                  </div>
                  <StatusBadge busArrived={!!entry.bus_arrived_at} />
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 text-xs text-ink-400">
                    <Clock className="h-3.5 w-3.5" />
                    Registered {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{new Date(entry.created_at).toLocaleDateString()}
                  </div>

                  {!entry.bus_arrived_at ? (
                    <button
                      onClick={() => handleCancel(entry)}
                      disabled={cancellingId === entry.id}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      {cancellingId === entry.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <XCircle className="h-3 w-3" />}
                      Cancel
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <Bus className="h-3 w-3" /> Bus arrived — confirm boarding on Dashboard
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Routes browser */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-amber-500" />
          <h3 className="text-base font-semibold text-ink-950 dark:text-white">Available Routes</h3>
        </div>

        {loadingR ? (
          <div className="flex items-center gap-2 py-6 text-sm text-ink-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading routes...
          </div>
        ) : routes.length === 0 ? (
          <EmptyState icon={Route} title="No routes available" description="No routes have been added yet." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {routes.map((route) => (
              <div key={route.id} className="surface-panel p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
                    <Route className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink-950 dark:text-white">{route.route_name}</p>
                    <p className="truncate text-xs text-ink-500">{route.source} → {route.destination}</p>
                    <div className="mt-2 flex gap-3 text-xs text-ink-400">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {route.total_stops} stops
                      </span>
                      <span className="flex items-center gap-1">
                        <Bus className="h-3 w-3" /> {route.total_buses} buses
                      </span>
                    </div>
                  </div>
                </div>
                <Link
                  to="/passenger"
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Search this route
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast ? (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-green-500 text-ink-950'
        }`}>
          {toast.msg}
        </div>
      ) : null}
    </div>
  );
}
