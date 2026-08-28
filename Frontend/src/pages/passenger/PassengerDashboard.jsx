import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  BusFront,
  List,
  Loader2,
  Locate,
  MapPin,
  MapPinned,
  Navigation,
  Radio,
  Route as RouteIcon,
  Search,
  SearchX,
  X,
} from "lucide-react";
import ConnectionBanner from "../../components/common/ConnectionBanner.jsx";
import EmptyState from "../../components/common/EmptyState.jsx";
import SkeletonBlock from "../../components/common/SkeletonBlock.jsx";
import PassengerLiveMap from "../../components/maps/PassengerLiveMap.jsx";
import PassengerSearchPanel from "../../components/passenger/PassengerSearchPanel.jsx";
import RouteBusSection from "../../components/passenger/RouteBusSection.jsx";
import WaitingRegistrationModal from "../../components/passenger/WaitingRegistrationModal.jsx";
import { usePassengerSocket } from "../../hooks/usePassengerSocket.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useGeolocation } from "../../hooks/useGeolocation.js";
import {
  registerPassengerWaiting,
  searchPassengerRoutes,
  getPassengerRoute,
  confirmBoarded,
  cancelWaiting,
  getNearestStops,
  getAllRoutes,
  quickSearch,
} from "../../services/passengerService.js";
import {
  getRouteBuses,
  mergeEtaIntoRoutes,
  mergeLocationIntoRoutes,
  normalizeBusLocationUpdate,
} from "../../utils/passengerRealtime.js";

const LAST_SEARCH_KEY = "busTrackPassengerLastSearch";
const PENDING_WAITING_KEY = "busTrackPassengerPendingWaiting";

// -- Active tab ---------------------------------------------------
const TAB_SEARCH  = "search";
const TAB_NEAREST = "nearest";
const TAB_BROWSE  = "browse";

function PassengerDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, token } = useAuth();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [routes, setRoutes] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [waitingBusId, setWaitingBusId] = useState(null);

  // Modal state — passenger picks their boarding stop before registering
  const [modalOpen, setModalOpen] = useState(false);
  const [modalBus, setModalBus] = useState(null); // bus the passenger clicked "I'm Waiting" on
  const [modalRoute, setModalRoute] = useState(null); // full route object from backend (with stops[])
  const [modalLoading, setModalLoading] = useState(false);

  // waitingEntry — stored after successful registration so board/cancel have the row id
  // shape: { id, stop_id, stop_name, route_id, bus_id }
  const [waitingEntry, setWaitingEntry] = useState(null);

  // boardingPrompt — shown when backend emits stop:reached for the passenger's registered stop
  const [boardingPrompt, setBoardingPrompt] = useState(null);

  // -- Nearest-stops mode state -------------------------------------
  const [activeTab, setActiveTab]           = useState(TAB_SEARCH);
  const [nearestStops, setNearestStops]     = useState([]);
  const [nearestLoading, setNearestLoading] = useState(false);
  const [nearestError, setNearestError]     = useState('');

  // -- Browse all routes state ------------------------------------
  const [browseRoutes, setBrowseRoutes]       = useState([]);
  const [browseLoading, setBrowseLoading]     = useState(false);
  const [browseError, setBrowseError]         = useState('');
  const [browseLoaded, setBrowseLoaded]       = useState(false);

  // -- Quick search state -----------------------------------------
  const [quickQuery, setQuickQuery]           = useState('');
  const [quickResults, setQuickResults]       = useState([]);
  const [quickLoading, setQuickLoading]       = useState(false);
  const [quickSearched, setQuickSearched]     = useState(false);

  const {
    coords: passengerCoords,
    loading: geoLoading,
    error: geoError,
    fetch: fetchGeo,
  } = useGeolocation();

  const routeIds = useMemo(
    () => routes.map((route) => route.route_id),
    [routes],
  );

  // ── Socket handlers ─────────────────────────────────────────────
  const handleLocationUpdated = useCallback((payload) => {
    setRoutes((cur) =>
      mergeLocationIntoRoutes(cur, normalizeBusLocationUpdate(payload)),
    );
  }, []);

  const handleEtaUpdated = useCallback((payload) => {
    setRoutes((cur) => mergeEtaIntoRoutes(cur, payload));
  }, []);

  const handleWaitingUpdated = useCallback(
    (payload) => {
      // If the bus has arrived at our registered stop, show boarding prompt
      if (
        payload.bus_arrived &&
        waitingEntry &&
        Number(payload.stop_id) === Number(waitingEntry.stop_id) &&
        Number(payload.route_id) === Number(waitingEntry.route_id)
      ) {
        setBoardingPrompt({
          stop_name: payload.stop_name,
          route_id: payload.route_id,
        });
      }
    },
    [waitingEntry],
  );

  const handleStopReached = useCallback(
    (payload) => {
      // Belt-and-suspenders: also listen to stop:reached directly
      if (
        waitingEntry &&
        Number(payload.stop_id) === Number(waitingEntry.stop_id) &&
        Number(payload.route_id) === Number(waitingEntry.route_id)
      ) {
        setBoardingPrompt({
          stop_name: payload.stop_name,
          route_id: payload.route_id,
        });
      }
    },
    [waitingEntry],
  );

  const socketStatus = usePassengerSocket({
    routeIds,
    onLocationUpdated: handleLocationUpdated,
    onEtaUpdated: handleEtaUpdated,
    onWaitingUpdated: handleWaitingUpdated,
    onStopReached: handleStopReached,
  });

  const buses = useMemo(() => getRouteBuses(routes), [routes]);
  const totalActiveBuses = buses.length;

  // ── Search ──────────────────────────────────────────────────────
  const runSearch = useCallback(async (searchFrom, searchTo) => {
    if (!searchFrom.trim() || !searchTo.trim()) return [];

    setLoading(true);
    setError("");
    setHasSearched(true);

    try {
      window.sessionStorage.setItem(
        LAST_SEARCH_KEY,
        JSON.stringify({ from: searchFrom, to: searchTo }),
      );
      const data = await searchPassengerRoutes({
        from: searchFrom,
        to: searchTo,
      });
      const nextRoutes = data.routes || [];
      setRoutes(nextRoutes);

      const firstRoute = nextRoutes[0];
      setSelectedRouteId(firstRoute?.route_id || null);
      setSelectedBusId(firstRoute?.nearest_bus?.bus_id || null);
      return nextRoutes;
    } catch (err) {
      setError(err.message || "Unable to search routes right now.");
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
    setActionMessage("");
    setActionError("");
    await runSearch(from, to);
  };

  const handleClear = () => {
    setFrom("");
    setTo("");
    setRoutes([]);
    setHasSearched(false);
    setSelectedRouteId(null);
    setSelectedBusId(null);
    setError("");
    setActionError("");
    setActionMessage("");
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
  const handleWaitingClick = useCallback(
    async (bus) => {
      setActionMessage("");
      setActionError("");
      setSelectedRouteId(bus.route_id);
      setSelectedBusId(bus.bus_id);

      if (!isAuthenticated) {
        window.sessionStorage.setItem(
          LAST_SEARCH_KEY,
          JSON.stringify({ from, to }),
        );
        window.sessionStorage.setItem(
          PENDING_WAITING_KEY,
          JSON.stringify({ routeId: bus.route_id, busId: bus.bus_id }),
        );
        navigate("/passenger/login", { state: { from: location } });
        return;
      }

      // Fetch full route with stops (ids included) to populate the modal
      setWaitingBusId(bus.bus_id);
      try {
        const data = await getPassengerRoute(bus.route_id);
        setModalBus(bus);
        setModalRoute(data.route); // has stops[{ id, stop_name, stop_order }]
        setModalOpen(true);
      } catch (err) {
        setActionError(err.message || "Could not load stop list.");
      } finally {
        setWaitingBusId(null);
      }
    },
    [from, isAuthenticated, location, navigate, to],
  );

  // ── Submit from modal: passenger chose a stop ───────────────────
  // stopObj = { id, stop_name, stop_order } from WaitingRegistrationModal
  const handleModalSubmit = useCallback(
    async (stopObj) => {
      if (!modalBus || !stopObj?.id) return;

      setModalLoading(true);
      try {
        const data = await registerPassengerWaiting({
          routeId: modalBus.route_id,
          stopId: stopObj.id,
          token,
        });

        setWaitingEntry({
          id: data.waiting?.id,
          stop_id: data.waiting?.stop_id,
          stop_name: stopObj.stop_name,
          route_id: modalBus.route_id,
          bus_id: modalBus.bus_id,
        });

        setActionMessage(
          data.message || `Waiting registered at ${stopObj.stop_name}.`,
        );
        setModalOpen(false);
        setModalBus(null);
        setModalRoute(null);
        window.sessionStorage.removeItem(PENDING_WAITING_KEY);
      } catch (err) {
        setActionError(err.message || "Could not register waiting.");
      } finally {
        setModalLoading(false);
      }
    },
    [modalBus, token],
  );

  // ── Board Bus ───────────────────────────────────────────────────
  const handleBoardBus = useCallback(async () => {
    if (!waitingEntry?.id) return;
    try {
      await confirmBoarded({ waitingId: waitingEntry.id, token });
      setActionMessage("Boarded confirmed. Have a safe trip!");
      setWaitingEntry(null);
      setBoardingPrompt(null);
    } catch (err) {
      setActionError(err.message || "Could not confirm boarding.");
    }
  }, [waitingEntry, token]);

  // ── Cancel Waiting ──────────────────────────────────────────────
  const handleCancelWaiting = useCallback(async () => {
    if (!waitingEntry?.id) return;
    try {
      await cancelWaiting({ waitingId: waitingEntry.id, token });
      setActionMessage("Waiting cancelled.");
      setWaitingEntry(null);
      setBoardingPrompt(null);
    } catch (err) {
      setActionError(err.message || "Could not cancel waiting.");
    }
  }, [waitingEntry, token]);

  // ── Restore last search on mount ────────────────────────────────
  // -- Nearest Stops ----------------------------------------------
  // Step 1: user taps the tab � trigger GPS request.
  const handleFindNearestStops = useCallback(() => {
    setNearestError('');
    setNearestLoading(true);
    setNearestStops([]);
    fetchGeo();
  }, [fetchGeo]);

  // Step 2: when GPS coords land (or error) and we are in loading state, call the API.
  useEffect(() => {
    if (activeTab !== TAB_NEAREST || !nearestLoading) return;
    if (geoError) {
      setNearestError(geoError);
      setNearestLoading(false);
      return;
    }
    if (!passengerCoords) return; // still waiting for GPS

    let cancelled = false;
    getNearestStops({ lat: passengerCoords.latitude, lon: passengerCoords.longitude })
      .then((data) => {
        if (!cancelled) {
          setNearestStops(data.stops || []);
          setNearestLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setNearestError(err.message || 'Could not load nearby stops.');
          setNearestLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeTab, nearestLoading, passengerCoords, geoError]);

  const handleClearNearest = useCallback(() => {
    setNearestStops([]);
    setNearestError('');
    setNearestLoading(false);
  }, []);

  // -- Browse all routes handler ----------------------------------
  const handleLoadBrowseRoutes = useCallback(async () => {
    if (browseLoaded) return;
    setBrowseLoading(true);
    setBrowseError('');
    try {
      const data = await getAllRoutes();
      setBrowseRoutes(data.routes || []);
      setBrowseLoaded(true);
    } catch (err) {
      setBrowseError(err.message || 'Could not load routes.');
    } finally {
      setBrowseLoading(false);
    }
  }, [browseLoaded]);

  // -- Quick search handler ---------------------------------------
  const handleQuickSearch = useCallback(async (e) => {
    e.preventDefault();
    const q = quickQuery.trim();
    if (q.length < 2) return;
    setQuickLoading(true);
    setQuickSearched(true);
    try {
      const data = await quickSearch({ q });
      setQuickResults(data.results || []);
    } catch (err) {
      setQuickResults([]);
    } finally {
      setQuickLoading(false);
    }
  }, [quickQuery]);

  const handleClearQuickSearch = useCallback(() => {
    setQuickQuery('');
    setQuickResults([]);
    setQuickSearched(false);
  }, []);
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
      const route = routes.find(
        (r) => Number(r.route_id) === Number(pending.routeId),
      );
      const bus = route?.all_buses?.find(
        (b) => Number(b.bus_id) === Number(pending.busId),
      );

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
              Search your source and destination, or find the nearest bus stop
              to your current location.
            </p>
            {/* -- Mode tabs -- */}
            <div className="mt-4 flex gap-2" role="tablist" aria-label="Passenger search mode">
              <button
                role="tab"
                aria-selected={activeTab === TAB_SEARCH}
                onClick={() => setActiveTab(TAB_SEARCH)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  activeTab === TAB_SEARCH
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
                }`}
              >
                <BusFront className="h-3.5 w-3.5" aria-hidden="true" />
                Find by route
              </button>
              <button
                role="tab"
                aria-selected={activeTab === TAB_NEAREST}
                onClick={() => {
                  setActiveTab(TAB_NEAREST);
                  if (!nearestStops.length && !nearestLoading) handleFindNearestStops();
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  activeTab === TAB_NEAREST
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
                }`}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                Nearest stops
              </button>
              <button
                role="tab"
                aria-selected={activeTab === TAB_BROWSE}
                onClick={() => {
                  setActiveTab(TAB_BROWSE);
                  handleLoadBrowseRoutes();
                }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                  activeTab === TAB_BROWSE
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
                }`}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
                Browse routes
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-72">
            <div className="rounded-lg bg-ink-50 p-4 dark:bg-ink-950/70">
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
                Routes found
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink-950 dark:text-white">
                {routes.length}
              </p>
            </div>
            <div className="rounded-lg bg-ink-50 p-4 dark:bg-ink-950/70">
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
                Live buses
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink-950 dark:text-white">
                {totalActiveBuses}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search panel: only shown in route-search tab */}
      {activeTab === TAB_SEARCH && (
        <PassengerSearchPanel
          from={from}
          to={to}
          onFromChange={setFrom}
          onToChange={setTo}
          onSubmit={handleSearch}
          onClear={handleClear}
          loading={loading}
        />
      )}

      {routes.length ? (
        <ConnectionBanner
          connected={socketStatus.connected}
          reconnecting={socketStatus.reconnecting}
          error={socketStatus.error}
        />
      ) : null}

      {error ? (
        <EmptyState
          icon={AlertCircle}
          title="Search failed"
          description={error}
        />
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
            🚌 Bus has arrived at{" "}
            <span className="font-bold">{boardingPrompt.stop_name}</span>. Did
            you board?
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
            Waiting at{" "}
            <span className="font-semibold">{waitingEntry.stop_name}</span>
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
          {/* -- Route-search tab -- */}
          {activeTab === TAB_SEARCH && (<>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink-950 dark:text-white">
                Route results
              </h3>
              <p className="text-sm text-ink-500 dark:text-ink-400">
                {hasSearched
                  ? "Select any available bus to focus it on the live map."
                  : "Start with a source and destination."}
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
          </>)}

          {/* -- Nearest-stops tab -- */}
          {activeTab === TAB_NEAREST && (
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-ink-950 dark:text-white">
                    Stops near you
                  </h3>
                  <p className="text-sm text-ink-500 dark:text-ink-400">
                    Sorted by walking distance. Tap a stop on the map for details.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={handleFindNearestStops}
                    disabled={nearestLoading || geoLoading}
                    aria-label="Refresh nearest stops"
                    className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-700 transition hover:bg-ink-50 disabled:opacity-50 dark:border-white/10 dark:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-700"
                  >
                    <Locate className={`h-3.5 w-3.5 ${nearestLoading || geoLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                    {nearestLoading || geoLoading ? "Locating\u2026" : "Refresh"}
                  </button>
                  {nearestStops.length > 0 && (
                    <button
                      onClick={handleClearNearest}
                      aria-label="Clear nearest stops"
                      className="inline-flex items-center gap-1 rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs font-medium text-ink-500 transition hover:bg-ink-50 dark:border-white/10 dark:bg-ink-800 dark:text-ink-400"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* GPS / API error */}
              {nearestError ? (
                <div className="surface-panel border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
                  {nearestError}
                </div>
              ) : null}

              {/* Loading skeleton */}
              {(nearestLoading || geoLoading) && !nearestError ? (
                <div className="space-y-2" aria-label="Locating nearby stops">
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                </div>
              ) : null}

              {/* Stop list */}
              {!nearestLoading && !geoLoading && nearestStops.length > 0 ? (
                <ol className="space-y-2" aria-label="Nearest bus stops">
                  {nearestStops.map((stop, idx) => {
                    const distLabel =
                      stop.distance_metres >= 1000
                        ? `${(stop.distance_metres / 1000).toFixed(1)} km`
                        : `${stop.distance_metres} m`;
                    const walkLabel =
                      stop.walk_minutes < 1 ? "<1 min" : `${stop.walk_minutes} min`;

                    return (
                      <li
                        key={stop.stop_id}
                        className={`relative rounded-xl border px-4 py-3 transition ${
                          idx === 0
                            ? "border-brand-200 bg-brand-50 dark:border-brand-400/20 dark:bg-brand-500/10"
                            : "border-ink-200 bg-white dark:border-white/10 dark:bg-ink-900"
                        }`}
                      >
                        {idx === 0 && (
                          <span className="absolute right-3 top-3 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                            Nearest
                          </span>
                        )}
                        <p className="pr-16 text-sm font-semibold text-ink-950 dark:text-white">
                          {stop.stop_name}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                          {stop.route_name} &mdash; {stop.source} &rarr; {stop.destination}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 font-medium text-ink-700 dark:text-ink-300">
                            <MapPin className="h-3 w-3 text-brand-500" aria-hidden="true" />
                            {distLabel}
                          </span>
                          <span className="text-ink-500 dark:text-ink-400">
                            ~{walkLabel} walk
                          </span>
                          <span
                            className={`font-medium ${
                              stop.active_buses > 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-ink-400 dark:text-ink-500"
                            }`}
                          >
                            {stop.active_buses === 0
                              ? "No active buses"
                              : `${stop.active_buses} active bus${stop.active_buses > 1 ? "es" : ""}`}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : null}

              {/* Empty � successful search, no stops found */}
              {!nearestLoading && !geoLoading && !nearestError && nearestStops.length === 0 && passengerCoords ? (
                <EmptyState
                  icon={SearchX}
                  title="No stops within 1 km"
                  description="There are no bus stops with GPS coordinates within 1 km of your location."
                />
              ) : null}

              {/* Idle � before any search */}
              {!nearestLoading && !geoLoading && !nearestError && nearestStops.length === 0 && !passengerCoords ? (
                <EmptyState
                  icon={MapPin}
                  title="Tap Refresh to locate nearby stops"
                  description="Your browser will ask for location permission. Stops within 1 km will appear here."
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">

          {/* -- Browse all routes tab -- */}
          {activeTab === TAB_BROWSE && (
            <div className="space-y-3">
              {/* Quick search bar */}
              <form onSubmit={handleQuickSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" aria-hidden="true" />
                  <input
                    value={quickQuery}
                    onChange={(e) => setQuickQuery(e.target.value)}
                    placeholder="Search by route name, bus number, or stop name..."
                    className="focus-ring h-11 w-full rounded-lg border border-ink-200 bg-ink-50 pl-10 pr-4 text-sm font-medium text-ink-950 outline-none transition-all placeholder:text-ink-400 hover:border-brand-300 focus:border-brand-500 dark:border-white/10 dark:bg-ink-950 dark:text-white dark:placeholder:text-ink-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={quickLoading || quickQuery.trim().length < 2}
                  className="focus-ring inline-flex h-11 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-panel hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500 dark:disabled:bg-ink-700"
                >
                  {quickLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Search
                </button>
                {quickSearched && (
                  <button
                    type="button"
                    onClick={handleClearQuickSearch}
                    className="focus-ring inline-flex h-11 items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 text-sm font-medium text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:bg-ink-800 dark:text-ink-300"
                  >
                    <X className="h-4 w-4" /> Clear
                  </button>
                )}
              </form>

              {/* Quick search results */}
              {quickSearched && !quickLoading && quickResults.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-ink-500 dark:text-ink-400">
                    {quickResults.length} result{quickResults.length > 1 ? 's' : ''} for &ldquo;{quickQuery}&rdquo;
                  </p>
                  {quickResults.map((r) => (
                    <Link
                      key={r.route_id}
                      to={`/passenger/route/${r.route_id}`}
                      className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-white/10 dark:bg-ink-900 dark:hover:border-brand-400/30 dark:hover:bg-brand-500/5"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                        <RouteIcon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-950 dark:text-white">{r.route_name}</p>
                        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                          {r.source} &rarr; {r.destination}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                          <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">{r.total_stops} stops</span>
                          <span className={`rounded px-1.5 py-0.5 font-medium ${r.active_buses > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-500'}`}>
                            {r.active_buses} active bus{r.active_buses !== 1 ? 'es' : ''}
                          </span>
                          {r.match_type === 'bus' && <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">Bus # match</span>}
                          {r.match_type === 'stop' && <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300">Stop match</span>}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {quickSearched && !quickLoading && quickResults.length === 0 && (
                <EmptyState icon={SearchX} title="No results" description={`No routes, buses, or stops matched "${quickQuery}".`} />
              )}

              {/* Divider when both sections visible */}
              {quickSearched && !quickLoading && browseRoutes.length > 0 && (
                <div className="flex items-center gap-3 pt-2">
                  <div className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
                  <span className="text-xs font-medium text-ink-400 dark:text-ink-500">All routes</span>
                  <div className="h-px flex-1 bg-ink-200 dark:bg-ink-700" />
                </div>
              )}

              {/* Header */}
              {!quickSearched && (
                <div>
                  <h3 className="text-base font-semibold text-ink-950 dark:text-white">All available routes</h3>
                  <p className="text-sm text-ink-500 dark:text-ink-400">
                    Tap a route to view its stops, active buses, and live map.
                  </p>
                </div>
              )}

              {/* Loading */}
              {browseLoading && (
                <div className="space-y-2" aria-label="Loading routes">
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                  <SkeletonBlock className="h-20" />
                </div>
              )}

              {/* Error */}
              {browseError && (
                <div className="surface-panel border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/20 dark:bg-rose-500/10 dark:text-rose-200">
                  {browseError}
                </div>
              )}

              {/* Route list */}
              {!browseLoading && browseRoutes.length > 0 && (
                <div className="space-y-2">
                  {browseRoutes.map((r) => (
                    <Link
                      key={r.id}
                      to={`/passenger/route/${r.id}`}
                      className="flex items-start gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 transition hover:border-brand-300 hover:bg-brand-50/50 dark:border-white/10 dark:bg-ink-900 dark:hover:border-brand-400/30 dark:hover:bg-brand-500/5"
                    >
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                        <RouteIcon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-ink-950 dark:text-white">{r.route_name}</p>
                        <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                          {r.source} &rarr; {r.destination}
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
                          <span className="rounded bg-ink-100 px-1.5 py-0.5 font-medium text-ink-600 dark:bg-ink-800 dark:text-ink-300">{r.total_stops} stops</span>
                          <span className={`rounded px-1.5 py-0.5 font-medium ${r.total_buses > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-ink-100 text-ink-500 dark:bg-ink-800 dark:text-ink-500'}`}>
                            {r.total_buses} active bus{r.total_buses !== 1 ? 'es' : ''}
                          </span>
                        </div>
                      </div>
                      <span className="mt-1 text-ink-300 dark:text-ink-600">&rsaquo;</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Empty */}
              {!browseLoading && !browseError && browseLoaded && browseRoutes.length === 0 && (
                <EmptyState icon={RouteIcon} title="No routes available" description="No routes have been created yet." />
              )}
            </div>
          )}
          {activeTab === TAB_BROWSE || activeTab === TAB_NEAREST || routes.length ? (
            <PassengerLiveMap
              buses={buses}
              selectedBusId={selectedBusId}
              nearestStops={activeTab === TAB_NEAREST ? nearestStops : undefined}
              passengerCoords={activeTab === TAB_NEAREST ? passengerCoords : undefined}
            />
          ) : (
            <EmptyState
              icon={MapPinned}
              title="Map waiting for route data"
              description="Search a route or switch to Nearest Stops to see the live map."
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
