import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle, BusFront, MapPinned, Radio, SearchX } from 'lucide-react';
import ConnectionBanner from '../../components/common/ConnectionBanner.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import SkeletonBlock from '../../components/common/SkeletonBlock.jsx';
import PassengerLiveMap from '../../components/maps/PassengerLiveMap.jsx';
import PassengerSearchPanel from '../../components/passenger/PassengerSearchPanel.jsx';
import RouteBusSection from '../../components/passenger/RouteBusSection.jsx';
import WaitingRegistrationModal from '../../components/passenger/WaitingRegistrationModal.jsx';
import { usePassengerSocket } from '../../hooks/usePassengerSocket.js';
import { useAuth } from '../../hooks/useAuth.js';
import {
  registerPassengerWaiting,
  searchPassengerRoutes,
  getPassengerRoute,
  confirmBoarded,
  cancelWaiting,
} from '../../services/passengerService.js';
import {
  getRouteBuses,
  mergeEtaIntoRoutes,
  mergeLocationIntoRoutes,
  normalizeBusLocationUpdate,
} from '../../utils/passengerRealtime.js';

const LAST_SEARCH_KEY     = 'busTrackPassengerLastSearch';
const PENDING_WAITING_KEY = 'busTrackPassengerPendingWaiting';

function PassengerDashboard() {
  const navigate        = useNavigate();
  const location        = useLocation();
  const { isAuthenticated, token } = useAuth();

  const [from, setFrom]               = useState('');
  const [to, setTo]                   = useState('');
  const [routes, setRoutes]           = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedBusId, setSelectedBusId]     = useState(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError]     = useState('');
  const [waitingBusId, setWaitingBusId]   = useState(null);

  // Modal state — passenger picks their boarding stop before registering
  const [modalOpen, setModalOpen]     = useState(false);
  const [modalBus, setModalBus]       = useState(null);   // bus the passenger clicked "I'm Waiting" on
  const [modalRoute, setModalRoute]   = useState(null);   // full route object from backend (with stops[])
  const [modalLoading, setModalLoading] = useState(false);

  // waitingEntry — stored after successful registration so board/cancel have the row id
  // shape: { id, stop_id, stop_name, route_id, bus_id }
  const [waitingEntry, setWaitingEntry] = useState(null);

  // boardingPrompt — shown when backend emits stop:reached for the passenger's registered stop
  const [boardingPrompt, setBoardingPrompt] = useState(null);

  const routeIds = useMemo(
    () => routes.map((route) => route.route_id),
    [routes],
  );

  // ── Socket handlers ─────────────────────────────────────────────
  const handleLocationUpdated = useCallback((payload) => {
    setRoutes((cur) => mergeLocationIntoRoutes(cur, normalizeBusLocationUpdate(payload)));
  }, []);

  const handleEtaUpdated = useCallback((payload) => {
    setRoutes((cur) => mergeEtaIntoRoutes(cur, payload));
  }, []);

  const handleWaitingUpdated = useCallback((payload) => {
    // If the bus has arrived at our registered stop, show boarding prompt
    if (
      payload.bus_arrived &&
      waitingEntry &&
      Number(payload.stop_id)  === Number(waitingEntry.stop_id) &&
      Number(payload.route_id) === Number(waitingEntry.route_id)
    ) {
      setBoardingPrompt({ stop_name: payload.stop_name, route_id: payload.route_id });
    }
  }, [waitingEntry]);

  const handleStopReached = useCallback((payload) => {
    // Belt-and-suspenders: also listen to stop:reached directly
    if (
      waitingEntry &&
      Number(payload.stop_id)  === Number(waitingEntry.stop_id) &&
      Number(payload.route_id) === Number(waitingEntry.route_id)
    ) {
      setBoardingPrompt({ stop_name: payload.stop_name, route_id: payload.route_id });
    }
  }, [waitingEntry]);

  const socketStatus = usePassengerSocket({
    routeIds,
    onLocationUpdated: handleLocationUpdated,
    onEtaUpdated:      handleEtaUpdated,
    onWaitingUpdated:  handleWaitingUpdated,
    onStopReached:     handleStopReached,
  });

  const buses            = useMemo(() => getRouteBuses(routes), [routes]);
  const totalActiveBuses = buses.length;

  // ── Search ──────────────────────────────────────────────────────
  const runSearch = useCallback(async (searchFrom, searchTo) => {
    if (!searchFrom.trim() || !searchTo.trim()) return [];

    setLoading(true);
    setError('');
    setHasSearched(true);

    try {
      window.sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ from: searchFrom, to: searchTo }));
      const data       = await searchPassengerRoutes({ from: searchFrom, to: searchTo });
      const nextRoutes = data.routes || [];
      setRoutes(nextRoutes);

      const firstRoute = nextRoutes[0];
      setSelectedRouteId(firstRoute?.route_id || null);
      setSelectedBusId(firstRoute?.nearest_bus?.bus_id || null);
      return nextRoutes;
    } catch (err) {
      setError(err.message || 'Unable to search routes right now.');
      setRoutes([]);
      setSelectedRouteId(null);
      setSelectedBusId(null);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async (event) => {
    event.preventDefault();
    setActionMessage('');
    setActionError('');
    await runSearch(from, to);
  };

  const handleClear = () => {
    setFrom('');
    setTo('');
    setRoutes([]);
    setHasSearched(false);
    setSelectedRouteId(null);
    setSelectedBusId(null);
    setError('');
    setActionError('');
    setActionMessage('');
    setWaitingEntry(null);
    setBoardingPrompt(null);
    setModalOpen(false);
    setModalBus(null);
    setModalRoute(null);
    window.sessionStorage.removeItem(LAST_SEARCH_KEY);
    window.sessionStorage.removeItem(PENDING_WAITING_KEY);
  };

  const handleSelectBus = (bus) => {
    setSelectedRouteId(bus.route_id);
    setSelectedBusId(bus.bus_id);
  };

  // ── Open modal: fetch full stop list for that route ─────────────
  // searchRoute only returns upcoming_stops as string names — no stop ids.
  // We need stop ids to register, so we fetch the full route details here.
  const handleWaitingClick = useCallback(async (bus) => {
    setActionMessage('');
    setActionError('');
    setSelectedRouteId(bus.route_id);
    setSelectedBusId(bus.bus_id);

    if (!isAuthenticated) {
      window.sessionStorage.setItem(LAST_SEARCH_KEY, JSON.stringify({ from, to }));
      window.sessionStorage.setItem(
        PENDING_WAITING_KEY,
        JSON.stringify({ routeId: bus.route_id, busId: bus.bus_id }),
      );
      navigate('/passenger/login', { state: { from: location } });
      return;
    }

    // Fetch full route with stops (ids included) to populate the modal
    setWaitingBusId(bus.bus_id);
    try {
      const data = await getPassengerRoute(bus.route_id);
      setModalBus(bus);
      setModalRoute(data.route);   // has stops[{ id, stop_name, stop_order }]
      setModalOpen(true);
    } catch (err) {
      setActionError(err.message || 'Could not load stop list.');
    } finally {
      setWaitingBusId(null);
    }
  }, [from, isAuthenticated, location, navigate, to]);

  // ── Submit from modal: passenger chose a stop ───────────────────
  // stopObj = { id, stop_name, stop_order } from WaitingRegistrationModal
  const handleModalSubmit = useCallback(async (stopObj) => {
    if (!modalBus || !stopObj?.id) return;

    setModalLoading(true);
    try {
      const data = await registerPassengerWaiting({
        routeId: modalBus.route_id,
        stopId:  stopObj.id,
        token,
      });

      setWaitingEntry({
        id:        data.waiting?.id,
        stop_id:   data.waiting?.stop_id,
        stop_name: stopObj.stop_name,
        route_id:  modalBus.route_id,
        bus_id:    modalBus.bus_id,
      });

      setActionMessage(data.message || `Waiting registered at ${stopObj.stop_name}.`);
      setModalOpen(false);
      setModalBus(null);
      setModalRoute(null);
      window.sessionStorage.removeItem(PENDING_WAITING_KEY);
    } catch (err) {
      setActionError(err.message || 'Could not register waiting.');
    } finally {
      setModalLoading(false);
    }
  }, [modalBus, token]);

  // ── Board Bus ───────────────────────────────────────────────────
  const handleBoardBus = useCallback(async () => {
    if (!waitingEntry?.id) return;
    try {
      await confirmBoarded({ waitingId: waitingEntry.id, token });
      setActionMessage('Boarded confirmed. Have a safe trip!');
      setWaitingEntry(null);
      setBoardingPrompt(null);
    } catch (err) {
      setActionError(err.message || 'Could not confirm boarding.');
    }
  }, [waitingEntry, token]);

  // ── Cancel Waiting ──────────────────────────────────────────────
  const handleCancelWaiting = useCallback(async () => {
    if (!waitingEntry?.id) return;
    try {
      await cancelWaiting({ waitingId: waitingEntry.id, token });
      setActionMessage('Waiting cancelled.');
      setWaitingEntry(null);
      setBoardingPrompt(null);
    } catch (err) {
      setActionError(err.message || 'Could not cancel waiting.');
    }
  }, [waitingEntry, token]);

  // ── Restore last search on mount ────────────────────────────────
  useEffect(() => {
    const savedSearchText = window.sessionStorage.getItem(LAST_SEARCH_KEY);
    if (!savedSearchText || hasSearched) return;

    try {
      const savedSearch = JSON.parse(savedSearchText);
      if (savedSearch.from && savedSearch.to) {
        setFrom(savedSearch.from);
        setTo(savedSearch.to);
        runSearch(savedSearch.from, savedSearch.to);
      }
    } catch {
      window.sessionStorage.removeItem(LAST_SEARCH_KEY);
    }
  }, [hasSearched, runSearch]);

  // ── Resume pending waiting after login redirect ─────────────────
  useEffect(() => {
    const pendingText = window.sessionStorage.getItem(PENDING_WAITING_KEY);
    if (!isAuthenticated || !token || !routes.length || !pendingText) return;

    try {
      const pending = JSON.parse(pendingText);
      const route   = routes.find((r) => Number(r.route_id) === Number(pending.routeId));
      const bus     = route?.all_buses?.find((b) => Number(b.bus_id) === Number(pending.busId));

      if (bus) {
        handleWaitingClick({ ...bus, route_id: route.route_id });
      }
    } catch {
      window.sessionStorage.removeItem(PENDING_WAITING_KEY);
    }
  }, [handleWaitingClick, isAuthenticated, routes, token]);

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-lg border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-sky-500 to-amber-400" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-200 dark:ring-brand-400/30">
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              Passenger live
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-normal text-ink-950 dark:text-white sm:text-3xl">
              Find a bus that is moving right now
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-600 dark:text-ink-300">
              Search your source and destination to load matching routes,
              active buses, live ETA, and realtime map movement.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <div className="rounded-lg bg-ink-50 p-4 dark:bg-ink-950/70">
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Routes found</p>
              <p className="mt-1 text-2xl font-semibold text-ink-950 dark:text-white">{routes.length}</p>
            </div>
            <div className="rounded-lg bg-ink-50 p-4 dark:bg-ink-950/70">
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Live buses</p>
              <p className="mt-1 text-2xl font-semibold text-ink-950 dark:text-white">{totalActiveBuses}</p>
            </div>
          </div>
        </div>
      </div>

      <PassengerSearchPanel
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onSubmit={handleSearch}
        onClear={handleClear}
        loading={loading}
      />

      {routes.length ? (
        <ConnectionBanner
          connected={socketStatus.connected}
          reconnecting={socketStatus.reconnecting}
          error={socketStatus.error}
        />
      ) : null}

      {error ? (
        <EmptyState icon={AlertCircle} title="Search failed" description={error} />
      ) : null}

      {actionMessage ? (
        <div className="surface-panel border-brand-200 bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 dark:border-brand-400/20 dark:bg-brand-500/10 dark:text-brand-200">
          {actionMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="surface-panel border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
          {actionError}
        </div>
      ) : null}

      {/* ── Boarding prompt: shown when bus arrives at passenger's stop ── */}
      {boardingPrompt && waitingEntry ? (
        <div className="surface-panel flex flex-col gap-3 border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-400/20 dark:bg-amber-500/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            🚌 Bus has arrived at <span className="font-bold">{boardingPrompt.stop_name}</span>. Did you board?
          </p>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={handleBoardBus}
              className="rounded-xl bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700"
            >
              Yes, I boarded
            </button>
            <button
              onClick={() => setBoardingPrompt(null)}
              className="rounded-xl border border-amber-300 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100 dark:border-amber-400/30 dark:text-amber-200"
            >
              No, next bus
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Cancel waiting bar: shown while passenger is registered ── */}
      {waitingEntry && !boardingPrompt ? (
        <div className="surface-panel flex items-center justify-between gap-3 border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Waiting at <span className="font-semibold">{waitingEntry.stop_name}</span>
          </p>
          <button
            onClick={handleCancelWaiting}
            className="rounded-xl border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:border-rose-400/30 dark:text-rose-400"
          >
            Cancel Waiting
          </button>
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(420px,1.05fr)]">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink-950 dark:text-white">
                Route results
              </h3>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {hasSearched
                  ? 'Select any available bus to focus it on the live map.'
                  : 'Start with a source and destination.'}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3" aria-label="Loading route results">
              <SkeletonBlock className="h-48" />
              <SkeletonBlock className="h-48" />
              <SkeletonBlock className="h-48" />
            </div>
          ) : null}

          {!loading && !error && routes.length ? (
            <div className="space-y-3">
              {routes.map((route) => (
                <RouteBusSection
                  key={route.route_id}
                  route={route}
                  selectedRouteId={selectedRouteId}
                  selectedBusId={selectedBusId}
                  onSelectBus={handleSelectBus}
                  onWaitingClick={handleWaitingClick}
                  isAuthenticated={isAuthenticated}
                  waitingBusId={waitingBusId}
                  activeWaitingBusId={waitingEntry?.bus_id ?? null}
                />
              ))}
            </div>
          ) : null}

          {!loading && !error && hasSearched && !routes.length ? (
            <EmptyState
              icon={SearchX}
              title="No routes found"
              description="The backend did not return a route for this source and destination pair."
            />
          ) : null}

          {!loading && !error && !hasSearched ? (
            <EmptyState
              icon={BusFront}
              title="Search for a live route"
              description="Use the route search above to connect this dashboard to the realtime backend."
            />
          ) : null}
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          {routes.length ? (
            <PassengerLiveMap buses={buses} selectedBusId={selectedBusId} />
          ) : (
            <EmptyState
              icon={MapPinned}
              title="Map waiting for route data"
              description="Live bus markers appear here after a successful backend route search."
            />
          )}
        </div>
      </div>

      {/* ── Waiting Registration Modal ── */}
      <WaitingRegistrationModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setModalBus(null);
          setModalRoute(null);
        }}
        selectedBus={modalBus}
        route={modalRoute}
        stops={modalRoute?.stops || []}
        onSubmit={handleModalSubmit}
        loading={modalLoading}
      />
    </section>
  );
}

export default PassengerDashboard;
