/**
 * useGeolocation
 *
 * Wraps navigator.geolocation.getCurrentPosition and exposes a
 * simple { coords, loading, error, fetch } interface.
 *
 * coords  — { latitude, longitude, accuracy } or null
 * loading — true while the browser is resolving the position
 * error   — human-readable string or null
 * fetch   — call this to (re-)trigger geolocation
 */
import { useCallback, useState } from 'react';

const GEO_TIMEOUT_MS   = 10_000;
const GEO_MAX_AGE_MS   = 30_000; // accept a cached fix up to 30 s old

function parseGeoError(err) {
  switch (err?.code) {
    case 1: // PERMISSION_DENIED
      return 'Location permission denied. Please allow location access in your browser settings.';
    case 2: // POSITION_UNAVAILABLE
      return 'Location unavailable. Make sure GPS or network location is enabled.';
    case 3: // TIMEOUT
      return 'Location request timed out. Please try again.';
    default:
      return 'Could not get your location. Please try again.';
  }
}

export function useGeolocation() {
  const [coords,  setCoords]  = useState(null);   // { latitude, longitude, accuracy }
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetch = useCallback(() => {
    if (!navigator?.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({
          latitude:  position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy:  position.coords.accuracy,
        });
        setLoading(false);
      },
      (err) => {
        setError(parseGeoError(err));
        setLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout:            GEO_TIMEOUT_MS,
        maximumAge:         GEO_MAX_AGE_MS,
      },
    );
  }, []);

  return { coords, loading, error, fetch };
}
