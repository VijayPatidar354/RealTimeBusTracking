import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Navigation, BusFront, Clock, Route as RouteIcon, AlertCircle, Loader2 } from 'lucide-react';
import L from 'leaflet';
import { Marker, Popup, useMap } from 'react-leaflet';
import BaseMap from '../../components/maps/BaseMap.jsx';
import LoadingSpinner from '../../components/common/LoadingSpinner.jsx';
import EmptyState from '../../components/common/EmptyState.jsx';
import { getPassengerRoute, getRouteETA } from '../../services/passengerService.js';

// ── Icons ─────────────────────────────────────────────────────────
function createStopIcon(isCurrent) {
  const bg = isCurrent ? '#2563eb' : '#64748b';
  const ring = isCurrent ? '#bfdbfe' : '#cbd5e1';
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${bg};border:3px solid ${ring};box-shadow:0 2px 6px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="white" stroke="none"/></svg></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -24],
  });
}

function createBusIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="bus-marker"><span>BUS</span></div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

// ── Map auto-fit ──────────────────────────────────────────────────
function MapFit({ stops, buses }) {
  const map = useMap();
  useEffect(() => {
    const points = [];
    stops.forEach((s) => {
      if (s.stop_lat && s.stop_lon) points.push([Number(s.stop_lat), Number(s.stop_lon)]);
    });
    buses.forEach((b) => {
      if (b.latitude && b.longitude) points.push([Number(b.latitude), Number(b.longitude)]);
    });
    if (points.length === 0) return;
    if (points.length === 1) { map.setView(points[0], 14, { animate: true }); return; }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15, animate: true });
  }, [stops, buses, map]);
  return null;
}

// ── Main ──────────────────────────────────────────────────────────
function PassengerRouteDetail() {
  const { id } = useParams();
  const [route, setRoute] = useState(null);
  const [eta, setEta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      getPassengerRoute(id),
      getRouteETA(id).catch(() => null),
    ])
      .then(([routeData, etaData]) => {
        if (cancelled) return;
        setRoute(routeData.route);
        setEta(etaData);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Failed to load route details.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [id]);

  const stops = useMemo(() => route?.stops || [], [route]);
  const buses = useMemo(() => route?.buses || [], [route]);

  const etaMap = useMemo(() => {
    const m = {};
    if (eta?.upcoming_stops) {
      eta.upcoming_stops.forEach((s) => { m[s.stop_name] = s.eta_minutes; });
    }
    return m;
  }, [eta]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <LoadingSpinner label="Loading route details" />
      </div>
    );
  }

  if (error || !route) {
    return (
      <section className="space-y-4 p-4">
        <Link to="/passenger" className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <EmptyState icon={AlertCircle} title="Route not found" description={error || 'The route you are looking for does not exist.'} />
      </section>
    );
  }

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="relative overflow-hidden rounded-lg border border-ink-200 bg-white p-5 shadow-panel dark:border-white/10 dark:bg-ink-900 sm:p-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-500 via-sky-500 to-amber-400" />
        <Link to="/passenger" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 dark:text-brand-400">
          <ArrowLeft className="h-4 w-4" /> Back to dashboard
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <RouteIcon className="h-5 w-5 text-brand-600" />
              <h2 className="text-2xl font-semibold text-ink-950 dark:text-white">{route.route_name}</h2>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-ink-600 dark:text-ink-300">
              <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-brand-600" />{route.source}</span>
              <span className="text-ink-300 dark:text-ink-600">→</span>
              <span className="flex items-center gap-1.5"><Navigation className="h-4 w-4 text-sky-600" />{route.destination}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:min-w-56">
            <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Stops</p>
              <p className="mt-1 text-xl font-semibold text-ink-950 dark:text-white">{stops.length}</p>
            </div>
            <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
              <p className="text-xs font-medium text-ink-500 dark:text-ink-400">Active Buses</p>
              <p className="mt-1 text-xl font-semibold text-ink-950 dark:text-white">{buses.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        {/* Stop list */}
        <div className="surface-panel overflow-hidden">
          <div className="border-b border-ink-200 px-4 py-3 dark:border-white/10">
            <h3 className="text-sm font-semibold text-ink-950 dark:text-white">All stops on this route</h3>
            <p className="text-xs text-ink-500 dark:text-ink-400">Sequential order from source to destination</p>
          </div>
          <ol className="divide-y divide-ink-100 dark:divide-white/5">
            {stops.map((stop, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === stops.length - 1;
              const etaMin = etaMap[stop.stop_name];

              return (
                <li key={stop.id} className="flex items-start gap-3 px-4 py-3">
                  {/* Timeline dot */}
                  <div className="flex flex-col items-center pt-1">
                    <div className={`h-3 w-3 rounded-full border-2 ${
                      isFirst ? 'border-brand-500 bg-brand-500' :
                      isLast ? 'border-sky-500 bg-sky-500' :
                      'border-ink-300 bg-white dark:border-ink-600 dark:bg-ink-800'
                    }`} />
                    {!isLast && <div className="mt-1 h-8 w-0.5 bg-ink-200 dark:bg-ink-700" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={`text-sm font-medium ${
                        isFirst || isLast ? 'text-ink-950 dark:text-white' : 'text-ink-700 dark:text-ink-300'
                      }`}>
                        {stop.stop_name}
                      </p>
                      {isFirst && <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">Start</span>}
                      {isLast && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">End</span>}
                    </div>
                    <p className="mt-0.5 text-xs text-ink-400 dark:text-ink-500">Stop #{stop.stop_order}</p>
                    {etaMin != null && (
                      <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        <Clock className="h-3 w-3" /> ~{etaMin} min ETA
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        {/* Map + Buses */}
        <div className="space-y-5 xl:sticky xl:top-20 xl:self-start">
          {/* Map */}
          <div className="surface-panel overflow-hidden">
            <div className="border-b border-ink-200 px-4 py-3 dark:border-white/10">
              <h3 className="text-sm font-semibold text-ink-950 dark:text-white">Route map</h3>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {stops.length} stops • {buses.length} active bus{buses.length !== 1 ? 'es' : ''}
              </p>
            </div>
            <BaseMap className="h-[400px] border-0 shadow-none sm:h-[440px]">
              <MapFit stops={stops} buses={buses} />
              {stops.map((stop, idx) => {
                if (!stop.stop_lat || !stop.stop_lon) return null;
                return (
                  <Marker key={stop.id} position={[Number(stop.stop_lat), Number(stop.stop_lon)]} icon={createStopIcon(idx === 0 || idx === stops.length - 1)}>
                    <Popup>
                      <div className="min-w-36">
                        <p className="text-sm font-semibold text-ink-950">{stop.stop_name}</p>
                        <p className="mt-0.5 text-xs text-ink-500">Stop #{stop.stop_order}</p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
              {buses.map((bus) => {
                if (!bus.latitude || !bus.longitude) return null;
                return (
                  <Marker key={bus.bus_id} position={[Number(bus.latitude), Number(bus.longitude)]} icon={createBusIcon()}>
                    <Popup>
                      <div className="min-w-36">
                        <p className="text-sm font-semibold text-ink-950">Bus {bus.bus_number}</p>
                        <p className="mt-0.5 text-xs text-ink-500">{bus.bus_type}</p>
                        {bus.driver_name && <p className="mt-1 text-xs text-ink-500">Driver: {bus.driver_name}</p>}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </BaseMap>
          </div>

          {/* Bus list */}
          {buses.length > 0 && (
            <div className="surface-panel overflow-hidden">
              <div className="border-b border-ink-200 px-4 py-3 dark:border-white/10">
                <h3 className="text-sm font-semibold text-ink-950 dark:text-white">Active buses</h3>
              </div>
              <ul className="divide-y divide-ink-100 dark:divide-white/5">
                {buses.map((bus) => (
                  <li key={bus.bus_id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                      <BusFront className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-950 dark:text-white">{bus.bus_number}</p>
                      <p className="text-xs text-ink-500 dark:text-ink-400">{bus.bus_type}{bus.driver_name ? ` • ${bus.driver_name}` : ''}</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Active</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default PassengerRouteDetail;
