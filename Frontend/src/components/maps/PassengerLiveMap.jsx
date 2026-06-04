import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import { Marker, Popup, useMap } from 'react-leaflet';
import BaseMap from './BaseMap.jsx';

function createBusIcon({ bus, selected }) {
  return L.divIcon({
    className: '',
    html: `
      <div class="bus-marker ${bus.is_nearest ? 'bus-marker-nearest' : ''} ${
        selected ? 'bus-marker-selected' : ''
      }">
        <span>${bus.bus_number || 'BUS'}</span>
      </div>
    `,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22],
  });
}

function MapBehavior({ buses, selectedBusId }) {
  const map = useMap();

  useEffect(() => {
    const points = buses
      .map((bus) => bus.current_location)
      .filter((location) => location?.latitude && location?.longitude)
      .map((location) => [location.latitude, location.longitude]);

    if (!points.length) {
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], 14, { animate: true });
      return;
    }

    map.fitBounds(L.latLngBounds(points), {
      padding: [36, 36],
      maxZoom: 15,
      animate: true,
    });
  }, [buses, map]);

  useEffect(() => {
    const selectedBus = buses.find(
      (bus) => Number(bus.bus_id) === Number(selectedBusId),
    );

    if (!selectedBus?.current_location) {
      return;
    }

    map.flyTo(
      [
        selectedBus.current_location.latitude,
        selectedBus.current_location.longitude,
      ],
      16,
      { duration: 0.8 },
    );
  }, [buses, map, selectedBusId]);

  return null;
}

function LiveBusMarkers({ buses, selectedBusId }) {
  const markerRefs = useRef({});

  useEffect(() => {
    const marker = markerRefs.current[String(selectedBusId)];
    if (marker) {
      marker.openPopup();
    }
  }, [selectedBusId, buses]);

  return buses.map((bus) => {
    const location = bus.current_location;
    if (!location?.latitude || !location?.longitude) {
      return null;
    }

    const selected = Number(bus.bus_id) === Number(selectedBusId);
    const icon = createBusIcon({ bus, selected });

    return (
      <Marker
        key={bus.bus_id}
        position={[location.latitude, location.longitude]}
        icon={icon}
        ref={(marker) => {
          if (marker) {
            markerRefs.current[String(bus.bus_id)] = marker;
          }
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
                : 'Speed pending'}
            </p>
          </div>
        </Popup>
      </Marker>
    );
  });
}

function PassengerLiveMap({ buses, selectedBusId }) {
  const visibleBuses = useMemo(
    () =>
      buses.filter(
        (bus) =>
          bus.current_location?.latitude && bus.current_location?.longitude,
      ),
    [buses],
  );

  return (
    <div className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="text-sm font-semibold text-ink-950 dark:text-white">
            Live map
          </h3>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            {visibleBuses.length
              ? `${visibleBuses.length} active bus marker${visibleBuses.length > 1 ? 's' : ''}`
              : 'Search a route to load live buses'}
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          OSM
        </span>
      </div>

      <BaseMap className="h-[440px] border-0 shadow-none sm:h-[520px]">
        <MapBehavior buses={visibleBuses} selectedBusId={selectedBusId} />
        <LiveBusMarkers buses={visibleBuses} selectedBusId={selectedBusId} />
      </BaseMap>
    </div>
  );
}

export default PassengerLiveMap;
