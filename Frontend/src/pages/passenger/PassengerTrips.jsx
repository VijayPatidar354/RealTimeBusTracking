import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bus, Clock, MapPin, Route, TicketCheck,
  Loader2, XCircle, RefreshCw, CheckCircle2,
  History, ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth.js';
import { getMyWaiting, getAllRoutes, cancelWaiting, getMyTrips } from '../../services/passengerService.js';

// ── Status badge ──────────────────────────────────────────────────
function StatusBadge({ status, busArrived }) {
  if (status === 'boarded')   return <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400"><CheckCircle2 className="h-3 w-3" /> Boarded</span>;
  if (status === 'cancelled') return <span className="flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-400"><XCircle className="h-3 w-3" /> Cancelled</span>;
  if (status === 'expired')   return <span className="flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-500 dark:bg-white/10 dark:text-ink-400"><Clock className="h-3 w-3" /> Expired</span>;
  if (busArrived)             return <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400"><Bus className="h-3 w-3" /> Bus arrived</span>;
  return <span className="flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Waiting</span>;
}

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

export default function PassengerTrips() {
  const { isAuthenticated, token, restoring } = useAuth();

  const [tab,           setTab]           = useState('active');  // 'active' | 'history' | 'routes'
  const [waiting,       setWaiting]       = useState([]);
  const [routes,        setRoutes]        = useState([]);
  const [trips,         setTrips]         = useState([]);
  const [tripsPage,     setTripsPage]     = useState(1);
  const [tripsTotalPages, setTripsTotalPages] = useState(1);
  const [tripsTotal,    setTripsTotal]    = useState(0);
  const [loadingW,      setLoadingW]      = useState(false);
  const [loadingR,      setLoadingR]      = useState(true);
  const [loadingT,      setLoadingT]      = useState(false);
  const [cancellingId,  setCancellingId]  = useState(null);
  const [toast,         setToast]         = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadWaiting = useCallback(async () => {
    // Wait for AuthContext to finish reading localStorage before checking
    // isAuthenticated — otherwise this fires with a stale/expired token
    // during the brief window before restoring flips to false.
    if (restoring || !isAuthenticated || !token) return;
    setLoadingW(true);
    try {
      const data = await getMyWaiting({ token });
      setWaiting(data.waiting || []);
    } catch (_) {}
    finally { setLoadingW(false); }
  }, [restoring, isAuthenticated, token]);

  const loadRoutes = useCallback(async () => {
    setLoadingR(true);
    try {
      const data = await getAllRoutes();
      setRoutes(data.routes || []);
    } catch (_) {}
    finally { setLoadingR(false); }
  }, []);

  const loadTrips = useCallback(async (page = 1) => {
    if (restoring || !isAuthenticated || !token) return;
    setLoadingT(true);
    try {
      const data = await getMyTrips({ token, page, limit: 20 });
      setTrips(data.trips || []);
      setTripsPage(data.page);
      setTripsTotalPages(data.total_pages);
      setTripsTotal(data.total);
    } catch (_) {}
    finally { setLoadingT(false); }
  }, [restoring, isAuthenticated, token]);

  useEffect(() => {
    // Only fire once AuthContext has finished restoring the session
    if (restoring) return;
    loadWaiting();
    loadRoutes();
  }, [restoring, loadWaiting, loadRoutes]);

  useEffect(() => {
    if (restoring) return;
    if (tab === 'history') loadTrips(1);
  }, [restoring, tab, loadTrips]);

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

  const tabList = [
    { key: 'active',  label: 'Active Waiting', icon: TicketCheck, count: waiting.length },
    { key: 'history', label: 'Trip History',   icon: History,     count: tripsTotal || null },
    { key: 'routes',  label: 'Browse Routes',  icon: Route,       count: routes.length },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-400 via-brand-500 to-sky-500" />
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink-950 dark:text-white">My Trips</h2>
            <p className="mt-1 text-sm text-ink-500">Waiting registrations, history and available routes</p>
          </div>
          {isAuthenticated ? (
            <button onClick={() => { loadWaiting(); if (tab === 'history') loadTrips(1); }}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50 dark:border-white/10 dark:hover:bg-white/10">
              <RefreshCw className={`h-3.5 w-3.5 ${(loadingW || loadingT) ? 'animate-spin' : ''}`} /> Refresh
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-ink-200 bg-ink-50 p-1 dark:border-white/10 dark:bg-ink-900">
        {tabList.map(({ key, label, icon: Icon, count }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${
              tab === key
                ? 'bg-white text-ink-950 shadow-sm dark:bg-ink-800 dark:text-white'
                : 'text-ink-500 hover:text-ink-700 dark:text-ink-400'
            }`}>
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
            {count ? (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${tab === key ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'bg-ink-200 text-ink-600 dark:bg-white/10 dark:text-ink-400'}`}>
                {count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── ACTIVE WAITING TAB ──────────────────────────────────── */}
      {tab === 'active' ? (
        !isAuthenticated ? (
          <EmptyState icon={TicketCheck} title="Login to see your waiting entries" description="Register or login to track your bus waiting status"
            action={
              <div className="flex gap-2">
                <Link to="/passenger/login" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Login</Link>
                <Link to="/passenger/register" className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300">Register</Link>
              </div>
            }
          />
        ) : loadingW ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
        ) : waiting.length === 0 ? (
          <EmptyState icon={TicketCheck} title="No active waiting" description="You are not currently registered as waiting at any stop. Search for a route on the Dashboard to get started." />
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
                    {new Date(entry.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}{new Date(entry.created_at).toLocaleDateString()}
                  </div>
                  {!entry.bus_arrived_at ? (
                    <button onClick={() => handleCancel(entry)} disabled={cancellingId === entry.id}
                      className="flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-500/30 dark:text-rose-400">
                      {cancellingId === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                      Cancel
                    </button>
                  ) : (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      <Bus className="mr-1 inline h-3 w-3" /> Confirm on Dashboard
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}

      {/* ── HISTORY TAB ─────────────────────────────────────────── */}
      {tab === 'history' ? (
        !isAuthenticated ? (
          <EmptyState icon={History} title="Login to see your trip history" description="Your boarding history, cancellations and expired entries appear here"
            action={<Link to="/passenger/login" className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Login</Link>}
          />
        ) : loadingT ? (
          <div className="flex items-center gap-2 py-8 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading history...</div>
        ) : trips.length === 0 ? (
          <EmptyState icon={History} title="No trip history yet" description="Trips appear here once you board a bus, cancel a waiting, or a waiting expires." />
        ) : (
          <div className="space-y-4">
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Boarded',   color: 'text-green-600', status: 'boarded' },
                { label: 'Cancelled', color: 'text-rose-500',  status: 'cancelled' },
                { label: 'Expired',   color: 'text-ink-400',   status: 'expired' },
              ].map(({ label, color, status }) => (
                <div key={status} className="surface-panel p-3 text-center">
                  <p className={`text-xl font-bold ${color}`}>
                    {trips.filter((t) => t.status === status).length}
                  </p>
                  <p className="text-xs text-ink-400">{label}</p>
                </div>
              ))}
            </div>

            {/* Trip list */}
            <div className="space-y-2">
              {trips.map((trip) => (
                <div key={trip.id} className="surface-panel flex items-center gap-3 p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    trip.status === 'boarded'   ? 'bg-green-50 dark:bg-green-500/10' :
                    trip.status === 'cancelled' ? 'bg-rose-50 dark:bg-rose-500/10' :
                    'bg-ink-100 dark:bg-white/10'
                  }`}>
                    {trip.status === 'boarded'   ? <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" /> :
                     trip.status === 'cancelled' ? <XCircle className="h-4 w-4 text-rose-500" /> :
                     <AlertCircle className="h-4 w-4 text-ink-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink-950 dark:text-white">{trip.stop_name}</p>
                    <p className="truncate text-xs text-ink-500">{trip.route_name} · {trip.source} → {trip.destination}</p>
                    <p className="text-xs text-ink-400">
                      {new Date(trip.resolved_at).toLocaleDateString()} · {new Date(trip.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <StatusBadge status={trip.status} />
                </div>
              ))}
            </div>

            {/* Pagination */}
            {tripsTotalPages > 1 ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-ink-400">Page {tripsPage} of {tripsTotalPages} · {tripsTotal} trips total</p>
                <div className="flex gap-2">
                  <button onClick={() => loadTrips(tripsPage - 1)} disabled={tripsPage <= 1 || loadingT}
                    className="flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 disabled:opacity-40 dark:border-white/10">
                    <ChevronLeft className="h-3.5 w-3.5" /> Prev
                  </button>
                  <button onClick={() => loadTrips(tripsPage + 1)} disabled={tripsPage >= tripsTotalPages || loadingT}
                    className="flex items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 disabled:opacity-40 dark:border-white/10">
                    Next <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {/* ── ROUTES TAB ──────────────────────────────────────────── */}
      {tab === 'routes' ? (
        loadingR ? (
          <div className="flex items-center gap-2 py-6 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading routes...</div>
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
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{route.total_stops} stops</span>
                      <span className="flex items-center gap-1"><Bus className="h-3 w-3" />{route.total_buses} buses</span>
                    </div>
                  </div>
                </div>
                <Link to="/passenger"
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white transition hover:bg-brand-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Search this route
                </Link>
              </div>
            ))}
          </div>
        )
      ) : null}

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
