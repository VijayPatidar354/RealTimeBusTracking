import { useCallback, useEffect, useRef, useState } from 'react';
import { Bus, Filter, Loader2, MapPin, Navigation, Radio, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { socket } from '../../sockets/socket.js';
import { getAllRoutes, getLiveBuses } from '../../services/passengerService.js';

// ── Leaflet map component ─────────────────────────────────────────
function LiveMap({ buses, selectedRouteId }) {
  const containerRef = useRef(null);
  const mapRef       = useRef(null);
  const markersRef   = useRef({});  // { bus_id: L.Marker }

  const visibleBuses = selectedRouteId
    ? buses.filter((b) => Number(b.route_id) === Number(selectedRouteId))
    : buses;

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current || !window.L) return;
    const L   = window.L;
    const map = L.map(containerRef.current, { zoomControl: true })
      .setView([10.8231, 78.6872], 12);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current  = null;
      markersRef.current = {};
    };
  }, []);

  // Update markers whenever buses or filter changes
  useEffect(() => {
    const L   = window.L;
    const map = mapRef.current;
    if (!L || !map) return;

    const visibleIds = new Set(visibleBuses.map((b) => String(b.bus_id)));

    // Remove markers for buses no longer visible
    Object.keys(markersRef.current).forEach((id) => {
      if (!visibleIds.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });

    visibleBuses.forEach((bus) => {
      if (!bus.latitude || !bus.longitude) return;
      const lat = parseFloat(bus.latitude);
      const lon = parseFloat(bus.longitude);
      const id  = String(bus.bus_id);

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#e74c3c;color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.4);border:2px solid #fff;">🚌</div>`,
        iconSize:   [36, 36],
        iconAnchor: [18, 18],
      });

      const popup = `
        <div style="min-width:160px">
          <b style="font-size:14px">${bus.bus_number}</b><br>
          <span style="color:#6b7280;font-size:12px">${bus.route_name}</span><br>
          <span style="font-size:12px">${bus.source} → ${bus.destination}</span><br>
          ${bus.driver_name ? `<span style="color:#6b7280;font-size:11px">Driver: ${bus.driver_name}</span>` : ''}
        </div>
      `;

      if (markersRef.current[id]) {
        markersRef.current[id].setLatLng([lat, lon]);
        markersRef.current[id].setPopupContent(popup);
      } else {
        markersRef.current[id] = L.marker([lat, lon], { icon, zIndexOffset: 500 })
          .addTo(map)
          .bindPopup(popup);
      }
    });

    // Fit to visible markers on first load
    const latlngs = visibleBuses
      .filter((b) => b.latitude && b.longitude)
      .map((b) => [parseFloat(b.latitude), parseFloat(b.longitude)]);

    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 15 });
    }
  }, [visibleBuses]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
}

// ── Main page ─────────────────────────────────────────────────────
export default function PassengerRouteMap() {
  const [leafletReady,     setLeafletReady]     = useState(!!window.L);
  const [buses,            setBuses]            = useState([]);
  const [routes,           setRoutes]           = useState([]);
  const [selectedRouteId,  setSelectedRouteId]  = useState('');
  const [loading,          setLoading]          = useState(true);
  const [lastUpdated,      setLastUpdated]       = useState(null);
  const [connected,        setConnected]         = useState(socket.connected);

  // Load Leaflet
  useEffect(() => {
    if (window.L) { setLeafletReady(true); return; }
    const css  = document.createElement('link');
    css.rel    = 'stylesheet';
    css.href   = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.appendChild(css);
    const script   = document.createElement('script');
    script.src     = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    script.onload  = () => setLeafletReady(true);
    document.head.appendChild(script);
  }, []);

  // Load initial data
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [busData, routeData] = await Promise.all([getLiveBuses(), getAllRoutes()]);
      setBuses(busData.buses || []);
      setRoutes(routeData.routes || []);
      setLastUpdated(new Date());
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Socket — live bus location updates
  useEffect(() => {
    const onConnect    = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onLocationUpdated = (data) => {
      setBuses((prev) =>
        prev.map((b) =>
          Number(b.bus_id) === Number(data.bus_id)
            ? { ...b, latitude: data.latitude, longitude: data.longitude }
            : b
        )
      );
      setLastUpdated(new Date());
    };

    socket.on('connect',              onConnect);
    socket.on('disconnect',           onDisconnect);
    socket.on('bus:location_updated', onLocationUpdated);
    if (!socket.connected) socket.connect();

    return () => {
      socket.off('connect',              onConnect);
      socket.off('disconnect',           onDisconnect);
      socket.off('bus:location_updated', onLocationUpdated);
    };
  }, []);

  const visibleBuses = selectedRouteId
    ? buses.filter((b) => Number(b.route_id) === Number(selectedRouteId))
    : buses;

  const liveBuses = buses.filter((b) => b.latitude && b.longitude);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-500 via-brand-500 to-amber-400" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-ink-950 dark:text-white">Live Route Map</h2>
            <p className="mt-1 text-sm text-ink-500">
              {liveBuses.length} bus{liveBuses.length !== 1 ? 'es' : ''} live
              {lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString()}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Socket status */}
            <span className={`flex items-center gap-1.5 text-xs font-medium ${connected ? 'text-green-600' : 'text-rose-500'}`}>
              {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {connected ? 'Live' : 'Offline'}
            </span>
            {/* Refresh */}
            <button onClick={load} disabled={loading} className="flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-50 disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Stat chips */}
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
            <Bus className="h-4 w-4 text-brand-500" />
            <span className="text-sm font-semibold text-ink-950 dark:text-white">{buses.length} Total Buses</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
            <Radio className="h-4 w-4 text-green-500" />
            <span className="text-sm font-semibold text-ink-950 dark:text-white">{liveBuses.length} With GPS</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2 dark:bg-ink-800/50">
            <MapPin className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-ink-950 dark:text-white">{routes.length} Routes</span>
          </div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Filter className="h-4 w-4 shrink-0 text-ink-400" />
        <select
          value={selectedRouteId}
          onChange={(e) => setSelectedRouteId(e.target.value)}
          className="w-full max-w-xs rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-950 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-ink-900 dark:text-white"
        >
          <option value="">All Routes</option>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>{r.route_name} ({r.source} → {r.destination})</option>
          ))}
        </select>
        {selectedRouteId ? (
          <button onClick={() => setSelectedRouteId('')} className="text-xs text-brand-600 hover:underline dark:text-brand-400">
            Clear
          </button>
        ) : null}
      </div>

      {/* Map */}
      <div className="overflow-hidden rounded-xl border border-ink-200 dark:border-white/10" style={{ height: '60vh', minHeight: 400 }}>
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading map...
          </div>
        ) : !leafletReady ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-ink-400">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading Leaflet...
          </div>
        ) : (
          <LiveMap buses={buses} selectedRouteId={selectedRouteId} />
        )}
      </div>

      {/* Bus list below map */}
      {visibleBuses.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-ink-950 dark:text-white">
            {selectedRouteId ? 'Buses on selected route' : 'All active buses'}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleBuses.map((bus) => (
              <div key={bus.bus_id} className="surface-panel flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xl dark:bg-brand-500/10">
                  🚌
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink-950 dark:text-white">{bus.bus_number}</p>
                    {bus.latitude ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-400">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" /> Live
                      </span>
                    ) : (
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs text-ink-500 dark:bg-white/10">No GPS</span>
                    )}
                  </div>
                  <p className="truncate text-xs text-ink-500">{bus.route_name} · {bus.source} → {bus.destination}</p>
                  {bus.latitude ? (
                    <p className="text-xs text-ink-400">
                      <Navigation className="mr-0.5 inline h-2.5 w-2.5" />
                      {parseFloat(bus.latitude).toFixed(4)}, {parseFloat(bus.longitude).toFixed(4)}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="surface-panel py-12 text-center text-sm text-ink-400">
          No buses found{selectedRouteId ? ' for selected route' : ''}.
        </div>
      )}

      <style>{`
        .leaflet-top { z-index: 400 !important; }
        .leaflet-pane { z-index: 300 !important; }
      `}</style>
    </div>
  );
}
