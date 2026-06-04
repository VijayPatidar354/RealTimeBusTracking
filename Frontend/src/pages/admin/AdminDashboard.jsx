import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bus, Users, Route, ShieldCheck, LogOut, Loader2,
  Wifi, WifiOff, RefreshCw, MapPin, Navigation,
  AlertTriangle, CheckCircle2, Radio, Building2,
  TrendingUp, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useAdminAuth } from '../../context/AdminAuthContext.jsx';
import { socket } from '../../sockets/socket.js';
import {
  getSystemStats, getAllBuses, getAllDrivers,
  getAllRoutes, getAllOwners, getWaitingOverview, getRouteById,
} from '../../services/adminService.js';

// ── Small reusable pieces ────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accent = 'brand' }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200',
    blue:  'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
    green: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-200',
    rose:  'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
    purple:'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-200',
  };
  return (
    <div className="surface-panel flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors[accent]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-ink-500 dark:text-ink-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-ink-950 dark:text-white">{value ?? '--'}</p>
        {sub ? <p className="text-xs text-ink-400">{sub}</p> : null}
      </div>
    </div>
  );
}

function BusStatusDot({ bus }) {
  const hasGPS    = bus.latitude && bus.longitude;
  const hasDriver = bus.driver_id;
  if (hasGPS && hasDriver)  return <span className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_4px_#22c55e]" title="Live" />;
  if (hasDriver && !hasGPS) return <span className="h-2 w-2 rounded-full bg-amber-400" title="Driver assigned, no GPS" />;
  return <span className="h-2 w-2 rounded-full bg-rose-500" title="No driver" />;
}

// ── LEAFLET MAP ──────────────────────────────────────────────────
function AdminMap({ buses, selectedRouteId }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef({});

  const visible = selectedRouteId
    ? buses.filter((b) => Number(b.route_id) === Number(selectedRouteId))
    : buses;

  useEffect(() => {
    if (mapRef.current || !containerRef.current || !window.L) return;
    const L   = window.L;
    const map = L.map(containerRef.current).setView([10.8231, 78.6872], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current   = null;
      markersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const L   = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    const visibleIds = new Set(visible.map((b) => String(b.bus_id)));
    Object.keys(markersRef.current).forEach((id) => {
      if (!visibleIds.has(id)) { map.removeLayer(markersRef.current[id]); delete markersRef.current[id]; }
    });

    visible.forEach((bus) => {
      if (!bus.latitude || !bus.longitude) return;
      const lat = parseFloat(bus.latitude);
      const lon = parseFloat(bus.longitude);
      const id  = String(bus.bus_id);
      const color = bus.latitude ? '#22c55e' : '#f59e0b';

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;border-radius:50%;width:34px;height:34px;display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid #fff;">🚌</div>`,
        iconSize: [34, 34], iconAnchor: [17, 17],
      });

      const popup = `<b>${bus.bus_number}</b><br><span style="color:#6b7280;font-size:12px">${bus.route_name || 'No route'}</span><br><span style="font-size:12px">${bus.driver_name || 'No driver'}</span>`;

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([lat, lon]);
      } else {
        markersRef.current[id] = L.marker([lat, lon], { icon, zIndexOffset: 500 })
          .addTo(map).bindPopup(popup);
      }
    });

    const latlngs = visible.filter((b) => b.latitude && b.longitude)
      .map((b) => [parseFloat(b.latitude), parseFloat(b.longitude)]);
    if (latlngs.length > 0) map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 15 });
  }, [visible]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ── LIVE MAP TAB ─────────────────────────────────────────────────
function LiveMapTab({ token, buses, setBuses, routes }) {
  const [selectedRoute,  setSelectedRoute]  = useState('');
  const [leafletReady,   setLeafletReady]   = useState(!!window.L);

  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const css = document.createElement('link');
    css.rel   = 'stylesheet';
    css.href  = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script   = document.createElement('script');
    script.src     = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload  = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // Live bus updates
  useEffect(() => {
    const handler = (data) => {
      setBuses((prev) =>
        prev.map((b) =>
          Number(b.bus_id) === Number(data.bus_id)
            ? { ...b, latitude: data.latitude, longitude: data.longitude }
            : b
        )
      );
    };
    socket.on('bus:location_updated', handler);
    return () => socket.off('bus:location_updated', handler);
  }, [setBuses]);

  const liveBuses = buses.filter((b) => b.latitude && b.longitude);
  const idleBuses = buses.filter((b) => !b.latitude || !b.longitude);

  return (
    <div className="space-y-4">
      {/* Filter + legend */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)}
          className="rounded-xl border border-ink-200 bg-white px-4 py-2 text-sm text-ink-950 outline-none focus:border-rose-500 dark:border-white/10 dark:bg-ink-900 dark:text-white">
          <option value="">All Routes ({buses.length} buses)</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>{r.route_name} — {r.source} → {r.destination}</option>
          ))}
        </select>
        <div className="flex items-center gap-4 text-xs text-ink-500">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" /> Live GPS ({liveBuses.length})</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> No GPS ({idleBuses.length})</span>
        </div>
      </div>

      {/* Map */}
      <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-white/10" style={{ height: '55vh', minHeight: 380 }}>
        {leafletReady
          ? <AdminMap buses={buses} selectedRouteId={selectedRoute} />
          : <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading map...</div>}
      </div>

      {/* Bus grid */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(selectedRoute ? buses.filter((b) => Number(b.route_id) === Number(selectedRoute)) : buses).map((bus) => (
          <div key={bus.bus_id} className="surface-panel flex items-center gap-3 p-4">
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xl dark:bg-brand-500/10">
              🚌
              <span className="absolute -right-0.5 -top-0.5"><BusStatusDot bus={bus} /></span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink-950 dark:text-white">{bus.bus_number}</p>
              <p className="truncate text-xs text-ink-500">{bus.route_name || 'No route'} · {bus.driver_name || 'No driver'}</p>
              {bus.latitude
                ? <p className="text-xs text-green-600 dark:text-green-400"><Navigation className="mr-0.5 inline h-2.5 w-2.5" />{parseFloat(bus.latitude).toFixed(4)}, {parseFloat(bus.longitude).toFixed(4)}</p>
                : <p className="text-xs text-rose-500">No GPS data</p>}
            </div>
          </div>
        ))}
      </div>

      <style>{`.leaflet-top{z-index:400!important}.leaflet-pane{z-index:300!important}`}</style>
    </div>
  );
}

// ── DRIVERS TAB ──────────────────────────────────────────────────
function DriversTab({ drivers }) {
  const [search, setSearch] = useState('');
  const filtered = drivers.filter((d) =>
    d.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
    d.phone?.includes(search) ||
    d.bus_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <input value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, phone or bus number..."
        className="w-full max-w-sm rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-rose-500 dark:border-white/10 dark:bg-ink-900 dark:text-white" />

      <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-200 bg-ink-50 dark:border-white/10 dark:bg-ink-800/50">
            <tr>
              {['Driver', 'Phone', 'License', 'Bus', 'Route', 'Status'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-ink-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-white/10">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-ink-400">No drivers found</td></tr>
            ) : filtered.map((d) => (
              <tr key={d.id} className="hover:bg-ink-50 dark:hover:bg-white/5">
                <td className="px-4 py-3 font-medium text-ink-950 dark:text-white">{d.driver_name}</td>
                <td className="px-4 py-3 text-ink-500">{d.phone}</td>
                <td className="px-4 py-3 text-ink-500">{d.license_number}</td>
                <td className="px-4 py-3">
                  {d.bus_number
                    ? <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{d.bus_number}</span>
                    : <span className="text-xs text-ink-400">—</span>}
                </td>
                <td className="px-4 py-3 text-ink-500 max-w-[160px] truncate">{d.route_name || '—'}</td>
                <td className="px-4 py-3">
                  {d.latitude
                    ? <span className="flex items-center gap-1 text-xs text-green-600"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Live</span>
                    : <span className="flex items-center gap-1 text-xs text-ink-400"><span className="h-1.5 w-1.5 rounded-full bg-ink-300" /> Offline</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ROUTES TAB ───────────────────────────────────────────────────
function RoutesTab({ token, routes }) {
  const [expanded,    setExpanded]    = useState(null);
  const [detail,      setDetail]      = useState({});
  const [detailLoad,  setDetailLoad]  = useState(null);

  const loadDetail = useCallback(async (routeId) => {
    if (detail[routeId]) return;
    setDetailLoad(routeId);
    try {
      const data = await getRouteById({ routeId, token });
      setDetail((prev) => ({ ...prev, [routeId]: data.route }));
    } catch (_) {}
    finally { setDetailLoad(null); }
  }, [detail, token]);

  const toggle = (route) => {
    if (expanded === route.id) { setExpanded(null); return; }
    setExpanded(route.id);
    loadDetail(route.id);
  };

  return (
    <div className="space-y-3">
      {routes.length === 0 ? (
        <div className="surface-panel py-12 text-center text-sm text-ink-400">No routes found</div>
      ) : routes.map((route) => {
        const isExpanded = expanded === route.id;
        const d = detail[route.id];
        return (
          <div key={route.id} className="surface-panel overflow-hidden">
            <div className="flex cursor-pointer items-center gap-4 p-4 hover:bg-ink-50 dark:hover:bg-white/5" onClick={() => toggle(route)}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
                <Route className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink-950 dark:text-white">{route.route_name}</p>
                <p className="text-xs text-ink-500">{route.source} → {route.destination} · Owner: {route.owner_name}</p>
              </div>
              <div className="flex shrink-0 items-center gap-4 text-xs text-ink-500">
                <span>{route.total_stops} stops</span>
                <span>{route.total_buses} buses</span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>

            {isExpanded ? (
              <div className="border-t border-ink-100 dark:border-white/10">
                {detailLoad === route.id ? (
                  <div className="flex items-center gap-2 px-4 py-6 text-sm text-ink-400">
                    <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                  </div>
                ) : d ? (
                  <div className="grid gap-4 p-4 sm:grid-cols-2">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Stops ({d.stops?.length})</p>
                      <div className="space-y-1.5">
                        {d.stops?.map((s) => (
                          <div key={s.id} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{s.stop_order}</div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-ink-950 dark:text-white">{s.stop_name}</p>
                              {s.stop_lat ? <p className="text-xs text-ink-400"><MapPin className="mr-0.5 inline h-2.5 w-2.5" />{parseFloat(s.stop_lat).toFixed(4)}, {parseFloat(s.stop_lon).toFixed(4)}</p>
                                : <p className="text-xs text-amber-500">No GPS</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Buses on Route</p>
                      <div className="space-y-1.5">
                        {d.buses?.length === 0 ? <p className="text-xs text-ink-400">No buses assigned</p>
                          : d.buses?.map((b) => (
                            <div key={b.bus_id} className="flex items-center gap-3 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                              <Bus className="h-4 w-4 shrink-0 text-brand-500" />
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-ink-950 dark:text-white">{b.bus_number}</p>
                                <p className="text-xs text-ink-500">{b.driver_name || 'No driver'} · Stop {b.current_stop_order}</p>
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.driver_id ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                {b.driver_id ? 'Active' : 'Idle'}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

// ── OWNERS TAB ───────────────────────────────────────────────────
function OwnersTab({ owners }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {owners.length === 0 ? (
        <div className="surface-panel col-span-full py-12 text-center text-sm text-ink-400">No owners found</div>
      ) : owners.map((owner) => (
        <div key={owner.id} className="surface-panel p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-50 dark:bg-purple-500/10">
              <Building2 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-ink-950 dark:text-white">{owner.owner_name}</p>
              <p className="truncate text-xs text-ink-500">{owner.email}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-800/50">
              <p className="text-xs text-ink-400">Buses</p>
              <p className="text-xl font-bold text-ink-950 dark:text-white">{owner.total_buses}</p>
            </div>
            <div className="rounded-xl bg-ink-50 p-3 dark:bg-ink-800/50">
              <p className="text-xs text-ink-400">Routes</p>
              <p className="text-xl font-bold text-ink-950 dark:text-white">{owner.total_routes}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── WAITING TAB ──────────────────────────────────────────────────
function WaitingTab({ waiting, loading }) {
  if (loading) return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-400">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading waiting overview...
    </div>
  );

  if (waiting.length === 0) return (
    <div className="surface-panel py-12 text-center text-sm text-ink-400">
      No passengers currently waiting across any route.
    </div>
  );

  // Group by route
  const byRoute = waiting.reduce((acc, w) => {
    const key = w.route_id;
    if (!acc[key]) acc[key] = { route_id: w.route_id, route_name: w.route_name, source: w.source, destination: w.destination, stops: [] };
    acc[key].stops.push(w);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {waiting.length} passengers waiting across {Object.keys(byRoute).length} routes
      </div>

      {Object.values(byRoute).map((group) => (
        <div key={group.route_id} className="surface-panel overflow-hidden">
          <div className="flex items-center gap-3 border-b border-ink-100 bg-ink-50 px-4 py-3 dark:border-white/10 dark:bg-ink-800/50">
            <Route className="h-4 w-4 text-amber-500" />
            <p className="font-semibold text-ink-950 dark:text-white">{group.route_name}</p>
            <span className="text-xs text-ink-500">{group.source} → {group.destination}</span>
          </div>
          <div className="divide-y divide-ink-100 dark:divide-white/10">
            {group.stops.map((s) => (
              <div key={s.stop_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">{s.stop_order}</div>
                  <p className="text-sm text-ink-950 dark:text-white">{s.stop_name}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${s.waiting_count >= 5 ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' : s.waiting_count >= 2 ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' : 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'}`}>
                  {s.waiting_count} waiting
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ADMIN DASHBOARD
// ═══════════════════════════════════════════════════════════════════
export default function AdminDashboard() {
  const { admin, token, logout, isAuthenticated, restoring } = useAdminAuth();
  const navigate  = useNavigate();
  const toastRef  = useRef(null);

  const [tab,          setTab]          = useState('map');
  const [stats,        setStats]        = useState(null);
  const [buses,        setBuses]        = useState([]);
  const [drivers,      setDrivers]      = useState([]);
  const [routes,       setRoutes]       = useState([]);
  const [owners,       setOwners]       = useState([]);
  const [waiting,      setWaiting]      = useState([]);
  const [connected,    setConnected]    = useState(socket.connected);
  const [loading,      setLoading]      = useState(true);
  const [waitingLoad,  setWaitingLoad]  = useState(false);
  const [lastRefresh,  setLastRefresh]  = useState(null);
  const [toast,        setToast]        = useState(null);

  // Auth guard
  useEffect(() => {
    if (!restoring && !isAuthenticated) navigate('/admin/login');
  }, [restoring, isAuthenticated, navigate]);

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastRef.current);
    setToast({ msg, type });
    toastRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // Load all data
  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [statsData, busData, driverData, routeData, ownerData] = await Promise.all([
        getSystemStats(token),
        getAllBuses(token),
        getAllDrivers(token),
        getAllRoutes(token),
        getAllOwners(token),
      ]);
      setStats(statsData.stats);
      setBuses(busData.buses || []);
      setDrivers(driverData.drivers || []);
      setRoutes(routeData.routes || []);
      setOwners(ownerData.owners || []);
      setLastRefresh(new Date());
    } catch (err) {
      showToast(err.message || 'Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, showToast]);

  const loadWaiting = useCallback(async () => {
    if (!token) return;
    setWaitingLoad(true);
    try {
      const data = await getWaitingOverview(token);
      setWaiting(data.waiting || []);
    } catch (_) {}
    finally { setWaitingLoad(false); }
  }, [token]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAll();
      loadWaiting();
    }
  }, [isAuthenticated, loadAll, loadWaiting]);

  // Socket
  useEffect(() => {
    if (!isAuthenticated) return;

    const onConnect    = () => { setConnected(true); socket.emit('join:admin'); };
    const onDisconnect = () => setConnected(false);

    const onBusLocation = (data) => {
      setBuses((prev) =>
        prev.map((b) =>
          Number(b.bus_id) === Number(data.bus_id)
            ? { ...b, latitude: data.latitude, longitude: data.longitude }
            : b
        )
      );
    };

    const onTripCompleted = (data) => {
      showToast(`🏁 Trip completed on route ${data.route_id}`, 'success');
      loadWaiting();
    };

    const onRouteAssigned = () => {
      loadAll();
      loadWaiting();
    };

    const onWaitingUpdated = () => loadWaiting();

    socket.on('connect',              onConnect);
    socket.on('disconnect',           onDisconnect);
    socket.on('bus:location_updated', onBusLocation);
    socket.on('trip:completed',       onTripCompleted);
    socket.on('bus:route_assigned',   onRouteAssigned);
    socket.on('waiting:updated',      onWaitingUpdated);

    if (!socket.connected) socket.connect();
    else onConnect();

    return () => {
      socket.off('connect',              onConnect);
      socket.off('disconnect',           onDisconnect);
      socket.off('bus:location_updated', onBusLocation);
      socket.off('trip:completed',       onTripCompleted);
      socket.off('bus:route_assigned',   onRouteAssigned);
      socket.off('waiting:updated',      onWaitingUpdated);
    };
  }, [isAuthenticated, loadAll, loadWaiting, showToast]);

  const handleLogout = () => { logout(); navigate('/admin/login'); };

  if (restoring) return (
    <div className="flex min-h-screen items-center justify-center text-sm text-ink-400">Restoring session...</div>
  );
  if (!isAuthenticated) return null;

  const tabs = [
    { key: 'map',     label: 'Live Map',  icon: MapPin },
    { key: 'drivers', label: 'Drivers',   icon: Users },
    { key: 'routes',  label: 'Routes',    icon: Route },
    { key: 'owners',  label: 'Owners',    icon: Building2 },
    { key: 'waiting', label: 'Waiting',   icon: Clock },
  ];

  return (
    <section className="space-y-6">

      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-rose-500 via-brand-500 to-amber-400" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
              <ShieldCheck className="h-3 w-3" /> Admin
            </span>
            <h2 className="mt-3 text-2xl font-bold text-ink-950 dark:text-white">Admin Dashboard</h2>
            <p className="mt-1 text-sm text-ink-500">
              {admin?.admin_name || admin?.email}
              {lastRefresh ? ` · Refreshed ${lastRefresh.toLocaleTimeString()}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {connected
              ? <span className="flex items-center gap-1.5 text-xs text-green-600"><Wifi className="h-3.5 w-3.5" /> Live</span>
              : <span className="flex items-center gap-1.5 text-xs text-rose-500"><WifiOff className="h-3.5 w-3.5" /> Offline</span>}
            <button onClick={loadAll} disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:border-rose-300 hover:text-rose-500 dark:border-white/10">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Bus}          label="Total Buses"   value={stats?.total_buses}      sub={`${stats?.live_buses || 0} live · ${stats?.idle_buses || 0} idle`}  accent="brand" />
        <StatCard icon={Users}        label="Drivers"       value={stats?.total_drivers}    accent="blue" />
        <StatCard icon={Route}        label="Routes"        value={stats?.total_routes}     accent="amber" />
        <StatCard icon={TrendingUp}   label="Passengers"    value={stats?.total_passengers} accent="green" />
        <StatCard icon={Building2}    label="Owners"        value={stats?.total_owners}     accent="purple" />
        <StatCard icon={Clock}        label="Active Waiting" value={stats?.active_waiting}  accent="rose" />
        <StatCard icon={Radio}        label="Live Buses"    value={stats?.live_buses}       sub="with GPS signal" accent="green" />
        <StatCard icon={CheckCircle2} label="Socket"        value={connected ? 'Connected' : 'Offline'} accent={connected ? 'green' : 'rose'} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-ink-200 bg-ink-50 p-1 dark:border-white/10 dark:bg-ink-900">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === key
                ? 'bg-white text-ink-950 shadow-sm dark:bg-ink-800 dark:text-white'
                : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'
            }`}>
            <Icon className="h-4 w-4" /> {label}
            {key === 'waiting' && waiting.length > 0
              ? <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-xs font-bold text-white">{waiting.length}</span>
              : null}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'map'     && <LiveMapTab token={token} buses={buses} setBuses={setBuses} routes={routes} />}
      {tab === 'drivers' && <DriversTab drivers={drivers} />}
      {tab === 'routes'  && <RoutesTab token={token} routes={routes} />}
      {tab === 'owners'  && <OwnersTab owners={owners} />}
      {tab === 'waiting' && <WaitingTab waiting={waiting} loading={waitingLoad} />}

      {/* Toast */}
      {toast ? (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl ${
          toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-green-500 text-ink-950'
        }`}>
          {toast.msg}
        </div>
      ) : null}
    </section>
  );
}
