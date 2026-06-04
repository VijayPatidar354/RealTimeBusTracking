import { MapContainer, TileLayer } from 'react-leaflet';

const defaultCenter = [12.9716, 77.5946];

function BaseMap({
  center = defaultCenter,
  zoom = 12,
  children,
  className = 'h-80',
  scrollWheelZoom = false,
}) {
  return (
    <div className={`overflow-hidden rounded-lg border border-ink-200 shadow-panel dark:border-white/10 ${className}`}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={scrollWheelZoom}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {children}
      </MapContainer>
    </div>
  );
}

export default BaseMap;
