import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bus, Users, Route, Plus, X, ChevronDown, ChevronUp,
  LogOut, Loader2, MapPin, Navigation, Wifi, WifiOff,
  CheckCircle2, Map,
} from 'lucide-react';
import { useOwnerAuth } from '../../context/OwnerAuthContext.jsx';
import { socket } from '../../sockets/socket.js';
import {
  getMyBuses, createBus, assignDriver, assignRoute,
  getMyRoutes, getMyRouteById, createRoute, addStop,
} from '../../services/ownerService.js';

// ── Helpers ───────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, accent = 'brand' }) {
  const colors = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200',
    blue:  'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
    green: 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-200',
  };
  return (
    <div className="surface-panel flex items-center gap-4 p-5">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colors[accent]}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-ink-500 dark:text-ink-400">{label}</p>
        <p className="mt-0.5 text-2xl font-bold text-ink-950 dark:text-white">{value ?? '--'}</p>
      </div>
    </div>
  );
}

function SectionHeader({ title, action }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-base font-semibold text-ink-950 dark:text-white">{title}</h3>
      {action}
    </div>
  );
}

function ToastBar({ toast }) {
  if (!toast) return null;
  return (
    <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl px-5 py-3 text-sm font-semibold shadow-xl ${
      toast.type === 'error' ? 'bg-rose-500 text-white' : 'bg-green-500 text-ink-950'
    }`}>
      {toast.msg}
    </div>
  );
}

function Modal({ open, title, onClose, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className={`w-full ${wide ? 'max-w-3xl' : 'max-w-md'} rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-900`}>
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4 dark:border-white/10">
          <h2 className="text-lg font-bold text-ink-950 dark:text-white">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div>
      {label ? <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label> : null}
      <input className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-950 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/30 dark:border-white/10 dark:bg-ink-800 dark:text-white" {...props} />
    </div>
  );
}

function Select({ label, children, ...props }) {
  return (
    <div>
      {label ? <label className="mb-1.5 block text-xs font-medium text-ink-500">{label}</label> : null}
      <select className="w-full rounded-xl border border-ink-200 bg-ink-50 px-4 py-2.5 text-sm text-ink-950 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-ink-800 dark:text-white" {...props}>
        {children}
      </select>
    </div>
  );
}

function Btn({ children, loading, variant = 'primary', className = '', ...props }) {
  const styles = {
    primary:   'bg-brand-600 text-white hover:bg-brand-700',
    secondary: 'border border-ink-200 text-ink-600 hover:bg-ink-50 dark:border-white/10 dark:text-ink-300 dark:hover:bg-white/10',
    danger:    'bg-rose-500 text-white hover:bg-rose-600',
    map:       'bg-sky-500 text-white hover:bg-sky-600',
  };
  return (
    <button disabled={loading} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`} {...props}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  BUS MAP MODAL — Leaflet map showing bus live position
//  Loads Leaflet dynamically (same as driver dashboard).
//  Updates live via socket bus:location_updated.
// ═══════════════════════════════════════════════════════════════════
function BusMapModal({ open, bus, onClose }) {
  const containerRef  = useRef(null);
  const mapRef        = useRef(null);
  const busMarkerRef  = useRef(null);
  const [leafletReady, setLeafletReady] = useState(!!window.L);
  const [liveCoords,   setLiveCoords]   = useState(
    bus?.latitude && bus?.longitude
      ? { lat: parseFloat(bus.latitude), lon: parseFloat(bus.longitude) }
      : null
  );
  const [lastUpdated, setLastUpdated] = useState(null);

  // Load Leaflet if not present
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const css   = document.createElement('link');
    css.rel     = 'stylesheet';
    css.href    = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script   = document.createElement('script');
    script.src     = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload  = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // Sync liveCoords when bus prop changes (fresh open)
  useEffect(() => {
    if (bus?.latitude && bus?.longitude) {
      setLiveCoords({ lat: parseFloat(bus.latitude), lon: parseFloat(bus.longitude) });
    } else {
      setLiveCoords(null);
    }
  }, [bus]);

  // Listen for live location updates for this specific bus
  useEffect(() => {
    if (!open || !bus) return;
    const handler = (data) => {
      // Match by bus_id (from socket payload) or bus_number
      if (Number(data.bus_id) === Number(bus.bus_id)) {
        setLiveCoords({ lat: parseFloat(data.latitude), lon: parseFloat(data.longitude) });
        setLastUpdated(new Date());
      }
    };
    socket.on('bus:location_updated', handler);
    return () => socket.off('bus:location_updated', handler);
  }, [open, bus]);

  // Init map when modal opens and Leaflet is ready
  useEffect(() => {
    if (!open || !leafletReady || !containerRef.current || mapRef.current) return;
    const L   = window.L;
    const map = L.map(containerRef.current, { zoomControl: true })
      .setView(liveCoords ? [liveCoords.lat, liveCoords.lon] : [10.8231, 78.6872], liveCoords ? 16 : 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    // Initial bus marker
    if (liveCoords) {
      busMarkerRef.current = L.marker([liveCoords.lat, liveCoords.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#e74c3c;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 12px rgba(0,0,0,0.55);border:3px solid #fff;">🚌</div>`,
          iconSize: [40, 40], iconAnchor: [20, 20],
        }),
        zIndexOffset: 1000,
      }).addTo(map).bindPopup(`<b>${bus.bus_number}</b><br>${bus.driver_name || 'No driver'}`);
    }
  }, [open, leafletReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker whenever liveCoords change
  useEffect(() => {
    const L   = window.L;
    const map = mapRef.current;
    if (!L || !map || !liveCoords) return;

    if (!busMarkerRef.current) {
      busMarkerRef.current = L.marker([liveCoords.lat, liveCoords.lon], {
        icon: L.divIcon({
          className: '',
          html: `<div style="background:#e74c3c;color:#fff;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 3px 12px rgba(0,0,0,0.55);border:3px solid #fff;">🚌</div>`,
          iconSize: [40, 40], iconAnchor: [20, 20],
        }),
        zIndexOffset: 1000,
      }).addTo(map).bindPopup(`<b>${bus?.bus_number}</b><br>${bus?.driver_name || 'No driver'}`);
      map.setView([liveCoords.lat, liveCoords.lon], 16);
    } else {
      busMarkerRef.current.setLatLng([liveCoords.lat, liveCoords.lon]);
      map.panTo([liveCoords.lat, liveCoords.lon]);
    }
  }, [liveCoords]);

  // Cleanup map when modal closes
  useEffect(() => {
    if (!open) {
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      busMarkerRef.current = null;
    }
  }, [open]);

  if (!open || !bus) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-900" style={{ height: '80vh' }}>
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-ink-100 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/10">
              <Bus className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            </div>
            <div>
              <p className="font-bold text-ink-950 dark:text-white">{bus.bus_number}</p>
              <p className="text-xs text-ink-500">{bus.driver_name || 'No driver assigned'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {liveCoords ? (
              <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Live
                {lastUpdated ? ` · ${lastUpdated.toLocaleTimeString()}` : ''}
              </span>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                No GPS data
              </span>
            )}
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 dark:hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Info strip */}
        {liveCoords ? (
          <div className="flex shrink-0 items-center gap-6 border-b border-ink-100 bg-ink-50 px-5 py-2 text-xs text-ink-500 dark:border-white/10 dark:bg-ink-800/50">
            <span className="flex items-center gap-1.5">
              <Navigation className="h-3 w-3" />
              {liveCoords.lat.toFixed(5)}, {liveCoords.lon.toFixed(5)}
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Stop {bus.current_stop_order ?? '—'}
            </span>
          </div>
        ) : null}

        {/* Map */}
        <div className="relative flex-1 min-h-0">
          {leafletReady ? (
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
          ) : (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading map...
            </div>
          )}

          {!liveCoords && leafletReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-50/80 dark:bg-ink-900/80">
              <MapPin className="h-8 w-8 text-ink-300" />
              <p className="text-sm font-medium text-ink-500">No GPS data available</p>
              <p className="text-xs text-ink-400">Driver has not sent a location yet.</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  BUSES SECTION
// ═══════════════════════════════════════════════════════════════════
function BusesSection({ token, routes, showToast, onBusesLoaded }) {
  const [buses,         setBuses]         = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [assignOpen,    setAssignOpen]    = useState(null);
  const [routeOpen,     setRouteOpen]     = useState(null);
  const [mapBus,        setMapBus]        = useState(null);   // bus to show on map
  const [busNumber,     setBusNumber]     = useState('');
  const [busType,       setBusType]       = useState('AC');
  const [driverId,      setDriverId]      = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [saving,        setSaving]        = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyBuses(token);
      const arr  = data.buses || [];
      setBuses(arr);
      onBusesLoaded?.(arr.length);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, showToast, onBusesLoaded]);

  useEffect(() => { load(); }, [load]);

  // Update live coords in buses array when socket fires
  useEffect(() => {
    const handler = (data) => {
      setBuses((prev) =>
        prev.map((b) =>
          Number(b.bus_id) === Number(data.bus_id)
            ? { ...b, latitude: data.latitude, longitude: data.longitude }
            : b
        )
      );
      // Also update mapBus if it's the one being tracked
      setMapBus((prev) =>
        prev && Number(prev.bus_id) === Number(data.bus_id)
          ? { ...prev, latitude: data.latitude, longitude: data.longitude }
          : prev
      );
    };
    const onRouteAssigned = (data) => {
      load();
      if (data?.auto_reversed) {
        showToast(`🔄 Bus auto-assigned return trip: ${data.route_name}`, 'success');
      }
    };
    socket.on('bus:location_updated', handler);
    socket.on('bus:route_assigned',   onRouteAssigned);
    return () => {
      socket.off('bus:location_updated', handler);
      socket.off('bus:route_assigned',   onRouteAssigned);
    };
  }, [load, showToast]);

  const handleCreate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await createBus({ bus_number: busNumber, bus_type: busType, token });
      showToast(`Bus ${busNumber} created`, 'success');
      setBusNumber(''); setBusType('AC'); setCreateOpen(false); load();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleAssignDriver = async (e) => {
    e.preventDefault(); if (!driverId.trim()) return; setSaving(true);
    try {
      await assignDriver({ busId: assignOpen.bus_id, driver_id: parseInt(driverId), token });
      showToast('Driver assigned', 'success');
      setAssignOpen(null); setDriverId(''); load();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleAssignRoute = async (e) => {
    e.preventDefault(); if (!selectedRoute) return; setSaving(true);
    try {
      await assignRoute({ busId: routeOpen.bus_id, route_id: parseInt(selectedRoute), token });
      showToast('Route assigned — bus reset to stop 1', 'success');
      setRouteOpen(null); setSelectedRoute(''); load();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={`My Buses (${buses.length})`}
        action={<Btn onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> Add Bus</Btn>}
      />

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading buses...
        </div>
      ) : buses.length === 0 ? (
        <div className="surface-panel py-12 text-center text-sm text-ink-400">No buses yet. Add your first bus above.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {buses.map((bus) => (
            <div key={bus.bus_id} className="surface-panel space-y-4 p-4">
              {/* Bus header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/10">
                    <Bus className="h-5 w-5 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div>
                    <p className="font-semibold text-ink-950 dark:text-white">{bus.bus_number}</p>
                    <p className="text-xs text-ink-500">{bus.bus_type}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  bus.driver_id
                    ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'
                }`}>
                  {bus.driver_id ? 'Driver assigned' : 'No driver'}
                </span>
              </div>

              {/* Driver + GPS info */}
              <div className="rounded-xl bg-ink-50 p-3 text-sm dark:bg-ink-800/50">
                <p className="text-xs font-medium text-ink-400">Driver</p>
                {bus.driver_name ? (
                  <>
                    <p className="mt-0.5 font-semibold text-ink-950 dark:text-white">{bus.driver_name}</p>
                    <p className="text-xs text-ink-500">{bus.phone} · #{bus.driver_id}</p>
                    {bus.latitude ? (
                      <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        {parseFloat(bus.latitude).toFixed(5)}, {parseFloat(bus.longitude).toFixed(5)}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-ink-400">No GPS yet</p>
                    )}
                  </>
                ) : (
                  <p className="mt-0.5 text-ink-400">Not assigned</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Btn variant="secondary" onClick={() => { setAssignOpen(bus); setDriverId(''); }} className="flex-1 justify-center">
                  <Users className="h-3.5 w-3.5" /> Driver
                </Btn>
                <Btn variant="secondary" onClick={() => { setRouteOpen(bus); setSelectedRoute(''); }} className="flex-1 justify-center">
                  <Route className="h-3.5 w-3.5" /> Route
                </Btn>
                <Btn variant="map" onClick={() => setMapBus(bus)} className="flex-1 justify-center">
                  <Map className="h-3.5 w-3.5" /> Track
                </Btn>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Bus map modal */}
      <BusMapModal open={!!mapBus} bus={mapBus} onClose={() => setMapBus(null)} />

      {/* Create bus modal */}
      <Modal open={createOpen} title="Add New Bus" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <Input label="Bus Number" value={busNumber} onChange={(e) => setBusNumber(e.target.value)} placeholder="TN45AB1234" required />
          <Select label="Bus Type" value={busType} onChange={(e) => setBusType(e.target.value)}>
            <option value="AC">AC</option>
            <option value="Non-AC">Non-AC</option>
            <option value="Sleeper">Sleeper</option>
            <option value="Mini">Mini</option>
          </Select>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Create Bus</Btn>
          </div>
        </form>
      </Modal>

      {/* Assign driver modal */}
      <Modal open={!!assignOpen} title={`Assign Driver — ${assignOpen?.bus_number}`} onClose={() => setAssignOpen(null)}>
        <form onSubmit={handleAssignDriver} className="space-y-4">
          <Input label="Driver ID" type="number" value={driverId} onChange={(e) => setDriverId(e.target.value)} placeholder="Enter driver ID" required />
          <p className="text-xs text-ink-400">You can find driver IDs in the driver management section.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" type="button" onClick={() => setAssignOpen(null)}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Assign Driver</Btn>
          </div>
        </form>
      </Modal>

      {/* Assign route modal */}
      <Modal open={!!routeOpen} title={`Assign Route — ${routeOpen?.bus_number}`} onClose={() => setRouteOpen(null)}>
        <form onSubmit={handleAssignRoute} className="space-y-4">
          <Select label="Select Route" value={selectedRoute} onChange={(e) => setSelectedRoute(e.target.value)} required>
            <option value="">Choose a route</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.route_name} ({r.source} → {r.destination})</option>
            ))}
          </Select>
          <p className="text-xs text-amber-600 dark:text-amber-400">⚠ Assigning a new route resets bus progression to stop 1.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" type="button" onClick={() => setRouteOpen(null)}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Assign Route</Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  ROUTES SECTION
// ═══════════════════════════════════════════════════════════════════
function RoutesSection({ token, onRoutesLoaded, showToast }) {
  const [routes,        setRoutes]        = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [expanded,      setExpanded]      = useState(null);
  const [routeDetail,   setRouteDetail]   = useState({});
  const [detailLoading, setDetailLoading] = useState(null);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [routeName,     setRouteName]     = useState('');
  const [source,        setSource]        = useState('');
  const [destination,   setDestination]   = useState('');
  const [saving,        setSaving]        = useState(false);
  const [stopOpen,      setStopOpen]      = useState(null);
  const [stopName,      setStopName]      = useState('');
  const [stopOrder,     setStopOrder]     = useState('');
  const [stopLat,       setStopLat]       = useState('');
  const [stopLon,       setStopLon]       = useState('');
  const [savingStop,    setSavingStop]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMyRoutes(token);
      const arr  = data.routes || [];
      setRoutes(arr);
      onRoutesLoaded(arr);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setLoading(false); }
  }, [token, showToast, onRoutesLoaded]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (routeId) => {
    if (routeDetail[routeId]) return;
    setDetailLoading(routeId);
    try {
      const data = await getMyRouteById({ routeId, token });
      setRouteDetail((prev) => ({ ...prev, [routeId]: data.route }));
    } catch (err) { showToast(err.message, 'error'); }
    finally { setDetailLoading(null); }
  }, [routeDetail, token, showToast]);

  const toggleExpand = (route) => {
    if (expanded === route.id) { setExpanded(null); return; }
    setExpanded(route.id);
    loadDetail(route.id);
  };

  const handleCreateRoute = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await createRoute({ route_name: routeName, source, destination, token });
      showToast(`Route "${routeName}" created`, 'success');
      setRouteName(''); setSource(''); setDestination(''); setCreateOpen(false); load();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const handleAddStop = async (e) => {
    e.preventDefault(); setSavingStop(true);
    try {
      await addStop({
        routeId:    stopOpen.id,
        stop_name:  stopName,
        stop_order: parseInt(stopOrder),
        stop_lat:   stopLat ? parseFloat(stopLat) : undefined,
        stop_lon:   stopLon ? parseFloat(stopLon) : undefined,
        token,
      });
      showToast(`Stop "${stopName}" added`, 'success');
      setStopName(''); setStopOrder(''); setStopLat(''); setStopLon(''); setStopOpen(null);
      setRouteDetail((prev) => { const n = { ...prev }; delete n[stopOpen.id]; return n; });
      if (expanded === stopOpen.id) loadDetail(stopOpen.id);
      load();
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSavingStop(false); }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title={`My Routes (${routes.length})`}
        action={<Btn onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4" /> New Route</Btn>}
      />

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading routes...
        </div>
      ) : routes.length === 0 ? (
        <div className="surface-panel py-12 text-center text-sm text-ink-400">No routes yet. Create your first route above.</div>
      ) : (
        <div className="space-y-3">
          {routes.map((route) => {
            const isExpanded = expanded === route.id;
            const detail     = routeDetail[route.id];
            return (
              <div key={route.id} className="surface-panel overflow-hidden">
                <div className="flex cursor-pointer items-center gap-4 p-4 hover:bg-ink-50 dark:hover:bg-white/5" onClick={() => toggleExpand(route)}>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
                    <Route className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-ink-950 dark:text-white">{route.route_name}</p>
                    <p className="truncate text-xs text-ink-500">{route.source} → {route.destination}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-xs text-ink-500">
                    <span className="hidden sm:inline">{route.total_stops} stops</span>
                    <span className="hidden sm:inline">{route.total_buses} buses</span>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-ink-100 dark:border-white/10">
                    {detailLoading === route.id ? (
                      <div className="flex items-center gap-2 px-4 py-6 text-sm text-ink-400">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading route details...
                      </div>
                    ) : detail ? (
                      <div className="grid gap-4 p-4 sm:grid-cols-2">
                        <div>
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Stops</p>
                            <button onClick={() => setStopOpen(route)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10">
                              <Plus className="h-3 w-3" /> Add Stop
                            </button>
                          </div>
                          {detail.stops?.length === 0 ? (
                            <p className="text-xs text-ink-400">No stops added yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {detail.stops?.map((stop) => (
                                <div key={stop.id} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                                    {stop.stop_order}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-ink-950 dark:text-white">{stop.stop_name}</p>
                                    {stop.stop_lat ? (
                                      <p className="text-xs text-ink-400"><MapPin className="mr-0.5 inline h-2.5 w-2.5" />{parseFloat(stop.stop_lat).toFixed(5)}, {parseFloat(stop.stop_lon).toFixed(5)}</p>
                                    ) : (
                                      <p className="text-xs text-amber-500">No GPS — manual mode</p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Buses on Route</p>
                          {detail.buses?.length === 0 ? (
                            <p className="text-xs text-ink-400">No buses assigned to this route.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {detail.buses?.map((bus) => (
                                <div key={bus.bus_id} className="flex items-center gap-3 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
                                  <Bus className="h-4 w-4 shrink-0 text-brand-500" />
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium text-ink-950 dark:text-white">{bus.bus_number}</p>
                                    <p className="text-xs text-ink-500">{bus.driver_name || 'No driver'} · Stop {bus.current_stop_order}</p>
                                    {bus.latitude ? (
                                      <p className="text-xs text-ink-400"><Navigation className="mr-0.5 inline h-2.5 w-2.5" />{parseFloat(bus.latitude).toFixed(5)}, {parseFloat(bus.longitude).toFixed(5)}</p>
                                    ) : null}
                                  </div>
                                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${bus.driver_id ? 'bg-green-50 text-green-700 dark:bg-green-500/10 dark:text-green-400' : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400'}`}>
                                    {bus.driver_id ? 'Active' : 'Idle'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={createOpen} title="Create New Route" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreateRoute} className="space-y-4">
          <Input label="Route Name" value={routeName} onChange={(e) => setRouteName(e.target.value)} placeholder="Chatram to Airport" required />
          <Input label="Source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Chatram" required />
          <Input label="Destination" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Airport" required />
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</Btn>
            <Btn type="submit" loading={saving}>Create Route</Btn>
          </div>
        </form>
      </Modal>

      <Modal open={!!stopOpen} title={`Add Stop — ${stopOpen?.route_name}`} onClose={() => setStopOpen(null)}>
        <form onSubmit={handleAddStop} className="space-y-4">
          <Input label="Stop Name" value={stopName} onChange={(e) => setStopName(e.target.value)} placeholder="Central Bus Stand" required />
          <Input label="Stop Order" type="number" min="1" value={stopOrder} onChange={(e) => setStopOrder(e.target.value)} placeholder="1" required />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Latitude (optional)" type="number" step="any" value={stopLat} onChange={(e) => setStopLat(e.target.value)} placeholder="10.76403" />
            <Input label="Longitude (optional)" type="number" step="any" value={stopLon} onChange={(e) => setStopLon(e.target.value)} placeholder="78.81805" />
          </div>
          <p className="text-xs text-ink-400">GPS coordinates enable automatic geofence detection for drivers.</p>
          <div className="flex justify-end gap-3 pt-2">
            <Btn variant="secondary" type="button" onClick={() => setStopOpen(null)}>Cancel</Btn>
            <Btn type="submit" loading={savingStop}>Add Stop</Btn>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  OWNER DASHBOARD
// ═══════════════════════════════════════════════════════════════════
export default function OwnerDashboard() {
  const { owner, token, logout, isAuthenticated, restoring } = useOwnerAuth();
  const navigate  = useNavigate();
  const toastTimer = useRef(null);

  const [tab,       setTab]       = useState('buses');
  const [routes,    setRoutes]    = useState([]);
  const [busCount,  setBusCount]  = useState(null);
  const [connected, setConnected] = useState(socket.connected);
  const [toast,     setToast]     = useState(null);

  useEffect(() => {
    if (!restoring && !isAuthenticated) navigate('/owner/login');
  }, [restoring, isAuthenticated, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const onConnect    = () => { setConnected(true); socket.emit('join:owner', {}); };
    const onDisconnect = () => setConnected(false);
    socket.on('connect',    onConnect);
    socket.on('disconnect', onDisconnect);
    if (!socket.connected) socket.connect();
    else onConnect();
    return () => { socket.off('connect', onConnect); socket.off('disconnect', onDisconnect); };
  }, [isAuthenticated]);

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  const handleRoutesLoaded = useCallback((arr) => setRoutes(arr), []);
  const handleLogout = () => { logout(); navigate('/owner/login'); };

  if (restoring) return (
    <div className="flex min-h-screen items-center justify-center text-sm text-ink-400">Restoring session...</div>
  );
  if (!isAuthenticated) return null;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-amber-400 to-sky-500" />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
              <Bus className="h-3 w-3" /> Fleet Owner
            </span>
            <h2 className="mt-3 text-2xl font-bold text-ink-950 dark:text-white">Owner Dashboard</h2>
            <p className="mt-1 text-sm text-ink-500">{owner?.email}</p>
          </div>
          <div className="flex items-center gap-3">
            {connected
              ? <span className="flex items-center gap-1.5 text-xs text-green-600"><Wifi className="h-3.5 w-3.5" /> Live</span>
              : <span className="flex items-center gap-1.5 text-xs text-rose-500"><WifiOff className="h-3.5 w-3.5" /> Offline</span>}
            <button onClick={handleLogout} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs text-ink-500 transition hover:border-rose-300 hover:text-rose-500 dark:border-white/10">
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Bus}          label="Total Buses"  value={busCount}      accent="brand" />
        <StatCard icon={Route}        label="Total Routes" value={routes.length} accent="amber" />
        <StatCard icon={Users}        label="Drivers"      value={busCount != null ? busCount : '--'} accent="blue" />
        <StatCard icon={CheckCircle2} label="Socket"       value={connected ? 'Connected' : 'Offline'} accent="green" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-ink-200 bg-ink-50 p-1 dark:border-white/10 dark:bg-ink-900">
        {[{ key: 'buses', label: 'Buses', icon: Bus }, { key: 'routes', label: 'Routes', icon: Route }].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)} className={`flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-semibold transition ${tab === key ? 'bg-white text-ink-950 shadow-sm dark:bg-ink-800 dark:text-white' : 'text-ink-500 hover:text-ink-700 dark:text-ink-400 dark:hover:text-ink-200'}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'buses' ? (
        <BusesSection token={token} routes={routes} showToast={showToast} onBusesLoaded={setBusCount} />
      ) : (
        <RoutesSection token={token} onRoutesLoaded={handleRoutesLoaded} showToast={showToast} />
      )}

      <ToastBar toast={toast} />
    </section>
  );
}
