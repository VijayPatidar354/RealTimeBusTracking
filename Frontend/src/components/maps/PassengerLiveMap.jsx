import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { Marker, Popup, useMap } from "react-leaflet";
import BaseMap from "./BaseMap.jsx";

// ── Bus icon ──────────────────────────────────────────────────────

function createBusIcon({ bus, selected }) {
  return L.divIcon({
    className: "",
    html: `
      <div class="bus-marker ${bus.is_nearest ? "bus-marker-nearest" : ""} ${
        selected ? "bus-marker-selected" : ""
      }">
        <span>${bus.bus_number || "BUS"}</span>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

// ── Stop pin icon (nearest-stop mode) ─────────────────────────────

function createStopIcon(isNearest) {
  const bg = isNearest ? "#2563eb" : "#64748b"; // brand-600 vs slate-500
  const ring = isNearest ? "#bfdbfe" : "#cbd5e1"; // brand-200 vs slate-300
  return L.divIcon({
    className: "",
    html: `
      <div style="
        width:28px;height:28px;border-radius:50%;
        background:${bg};border:3px solid ${ring};
        box-shadow:0 2px 6px rgba(0,0,0,.3);
        display:flex;align-items:center;justify-content:center;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5" fill="white" stroke="none"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

// ── Passenger "you are here" dot ──────────────────────────────────

const passengerIcon = L.divIcon({
  className: "",
  html: `
    <div style="
      width:18px;height:18px;border-radius:50%;
      background:#2563eb;border:3px solid white;
      box-shadow:0 0 0 3px rgba(37,99,235,.35);
    "></div>
  `,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  popupAnchor: [0, -12],
});

// ── Map auto-fit behaviour ────────────────────────────────────────

function MapBehavior({ buses, nearestStops, passengerCoords, selectedBusId }) {
  const map = useMap();

  // Fit to bus markers when bus list changes (route-search mode)
  useEffect(() => {
    // When we have nearest-stop data, don't interfere — NearestStopsBehavior handles it
    if (nearestStops?.length) return;

    const points = buses
      .map((bus) => bus.current_location)
      .filter((loc) => loc?.latitude && loc?.longitude)
      .map((loc) => [loc.latitude, loc.longitude]);

    if (!points.length) return;

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(points), {
        padding: [36, 36],
        maxZoom: 15,
        animate: true,
      });
    }
  }, [buses, nearestStops, map]);

  // Fly to selected bus
  useEffect(() => {
    if (nearestStops?.length) return;

    const selectedBus = buses.find(
      (b) => Number(b.bus_id) === Number(selectedBusId),
    );
    if (!selectedBus?.current_location) return;

    map.flyTo(
      [
        selectedBus.current_location.latitude,
        selectedBus.current_location.longitude,
      ],
      16,
      { duration: 0.8 },
    );
  }, [buses, nearestStops, map, selectedBusId]);

  return null;
}

// Separate behaviour component for nearest-stops mode so it has clear deps
function NearestStopsBehavior({ nearestStops, passengerCoords }) {
  const map = useMap();

  useEffect(() => {
    if (!nearestStops?.length) return;

    const points = [];

    if (passengerCoords) {
      points.push([passengerCoords.latitude, passengerCoords.longitude]);
    }

    nearestStops.forEach((s) => {
      if (s.stop_lat && s.stop_lon) {
        points.push([s.stop_lat, s.stop_lon]);
      }
    });

    if (!points.length) return;

    if (points.length === 1) {
      map.setView(points[0], 16, { animate: true });
    } else {
      map.fitBounds(L.latLngBounds(points), {
        padding: [48, 48],
        maxZoom: 16,
        animate: true,
      });
    }
  }, [nearestStops, passengerCoords, map]);

  return null;
}

// ── Live bus markers ──────────────────────────────────────────────

function LiveBusMarkers({ buses, selectedBusId }) {
  const markerRefs = useRef({});

  useEffect(() => {
    const marker = markerRefs.current[String(selectedBusId)];
    if (marker) marker.openPopup();
  }, [selectedBusId, buses]);

  return buses.map((bus) => {
    const location = bus.current_location;
    if (!location?.latitude || !location?.longitude) return null;

    const selected = Number(bus.bus_id) === Number(selectedBusId);
    const icon = createBusIcon({ bus, selected });

    return (
      <Marker
        key={bus.bus_id}
        position={[location.latitude, location.longitude]}
        icon={icon}
        ref={(marker) => {
          if (marker) markerRefs.current[String(bus.bus_id)] = marker;
        }}
      >
        <Popup>
          <div className="min-w-40">
            <p className="text-sm font-semibold text-ink-950">
              Bus {bus.bus_number}
            </p>
            <p className="mt-1 text-xs text-ink-600">{bus.route_name}</p>
            <p className="mt-2 text-xs text-ink-600">
              {bus.source_stop} to {bus.destination_stop}
            </p>
            <p className="mt-2 text-xs font-semibold text-brand-700">
              {bus.current_speed_kmph
                ? `${Math.round(bus.current_speed_kmph)} km/h`
                : "Speed pending"}
            </p>
          </div>
        </Popup>
      </Marker>
    );
  });
}

// ── Nearest-stop markers ──────────────────────────────────────────

function NearestStopMarkers({ nearestStops }) {
  if (!nearestStops?.length) return null;

  return nearestStops.map((stop, idx) => {
    if (!stop.stop_lat || !stop.stop_lon) return null;

    const isNearest = idx === 0;
    const icon = createStopIcon(isNearest);

    const walkText =
      stop.walk_minutes != null
        ? stop.walk_minutes < 1
          ? "less than 1 min walk"
          : `~${stop.walk_minutes} min walk`
        : null;

    return (
      <Marker
        key={stop.stop_id}
        position={[stop.stop_lat, stop.stop_lon]}
        icon={icon}
      >
        <Popup>
          <div className="min-w-44">
            {isNearest && (
              <span className="mb-1 inline-block rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                Nearest
              </span>
            )}
            <p className="text-sm font-semibold text-ink-950">
              {stop.stop_name}
            </p>
            <p className="mt-0.5 text-xs text-ink-500">{stop.route_name}</p>
            <p className="mt-0.5 text-xs text-ink-500">
              {stop.source} → {stop.destination}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="font-medium text-ink-700">
                {stop.distance_metres != null
                  ? stop.distance_metres >= 1000
                    ? `${(stop.distance_metres / 1000).toFixed(1)} km`
                    : `${stop.distance_metres} m`
                  : ""}
              </span>
              {walkText && <span className="text-ink-500">{walkText}</span>}
            </div>
            {stop.active_buses != null && (
              <p className="mt-1 text-xs font-medium text-emerald-700">
                {stop.active_buses === 0
                  ? "No active buses right now"
                  : `${stop.active_buses} active bus${stop.active_buses > 1 ? "es" : ""}`}
              </p>
            )}
          </div>
        </Popup>
      </Marker>
    );
  });
}

// ── Passenger "you are here" marker ──────────────────────────────

function PassengerLocationMarker({ coords }) {
  if (!coords?.latitude || !coords?.longitude) return null;

  return (
    <Marker position={[coords.latitude, coords.longitude]} icon={passengerIcon}>
      <Popup>
        <p className="text-xs font-semibold text-ink-950">You are here</p>
        {coords.accuracy != null && (
          <p className="mt-0.5 text-xs text-ink-500">
            ±{Math.round(coords.accuracy)} m accuracy
          </p>
        )}
      </Popup>
    </Marker>
  );
}

// ── Main component ────────────────────────────────────────────────

/**
 * PassengerLiveMap
 *
 * Route-search mode  (default): renders live bus markers.
 * Nearest-stop mode:            renders passenger location pin + stop pins.
 *                               Both modes can coexist — buses are always shown
 *                               if present.
 *
 * Props:
 *   buses           — array of live bus objects from passengerRealtime utils
 *   selectedBusId   — highlights + flies-to the selected bus
 *   nearestStops    — array from getNearestStops API (optional)
 *   passengerCoords — { latitude, longitude, accuracy } (optional)
 */
function PassengerLiveMap({
  buses,
  selectedBusId,
  nearestStops,
  passengerCoords,
}) {
  const visibleBuses = useMemo(
    () =>
      buses.filter(
        (bus) =>
          bus.current_location?.latitude && bus.current_location?.longitude,
      ),
    [buses],
  );

  const nearestStopMode = Boolean(nearestStops?.length || passengerCoords);

  // Subtitle copy adapts to the current mode
  const subtitle = useMemo(() => {
    if (nearestStopMode && nearestStops?.length) {
      return `${nearestStops.length} stop${nearestStops.length > 1 ? "s" : ""} near you`;
    }
    if (nearestStopMode) {
      return "Locating nearby stops…";
    }
    if (visibleBuses.length) {
      return `${visibleBuses.length} active bus marker${visibleBuses.length > 1 ? "s" : ""}`;
    }
    return "Search a route to load live buses";
  }, [nearestStopMode, nearestStops, visibleBuses.length]);

  return (
    <div className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-ink-950 dark:text-white">
            Live map
          </h3>
          <p className="text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          OSM
        </span>
      </div>

      <BaseMap className="h-[440px] border-0 shadow-none sm:h-[520px]">
        {/* Route-search fit / fly-to behaviour */}
        <MapBehavior
          buses={visibleBuses}
          nearestStops={nearestStops}
          passengerCoords={passengerCoords}
          selectedBusId={selectedBusId}
        />
        {/* Nearest-stop fit behaviour */}
        {nearestStopMode && (
          <NearestStopsBehavior
            nearestStops={nearestStops}
            passengerCoords={passengerCoords}
          />
        )}

        {/* Markers — always render buses if any exist */}
        <LiveBusMarkers buses={visibleBuses} selectedBusId={selectedBusId} />

        {/* Nearest-stop mode layers */}
        <PassengerLocationMarker coords={passengerCoords} />
        <NearestStopMarkers nearestStops={nearestStops} />
      </BaseMap>
    </div>
  );
}

export default PassengerLiveMap;
