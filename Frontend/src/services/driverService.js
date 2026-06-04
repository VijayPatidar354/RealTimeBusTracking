const API_BASE_URL = import.meta.env.DEV
  ? ''
  : import.meta.env.VITE_API_BASE_URL || '';

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name    = 'ApiError';
    this.status  = status;
    this.payload = payload;
  }
}

async function request(path, options = {}) {
  const url      = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  const response = await fetch(url, {
    headers: { Accept: 'application/json', ...options.headers },
    ...options,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new ApiError(
      payload?.message || `Request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }
  return payload;
}

// ── Session helpers ────────────────────────────────────────────────
const DRIVER_TOKEN_KEY = 'busTrackDriverToken';
const DRIVER_INFO_KEY  = 'busTrackDriverInfo';

export function saveDriverSession(token, driver) {
  localStorage.setItem(DRIVER_TOKEN_KEY, token);
  localStorage.setItem(DRIVER_INFO_KEY, JSON.stringify(driver));
}

export function readDriverSession() {
  return {
    token:  localStorage.getItem(DRIVER_TOKEN_KEY) || null,
    driver: JSON.parse(localStorage.getItem(DRIVER_INFO_KEY) || 'null'),
  };
}

export function clearDriverSession() {
  localStorage.removeItem(DRIVER_TOKEN_KEY);
  localStorage.removeItem(DRIVER_INFO_KEY);
}

// ── API calls ──────────────────────────────────────────────────────
export async function loginDriver({ phone, password }) {
  return request('/api/driver/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ phone, password }),
  });
}

export async function getDriverProfile(token) {
  return request('/api/driver/profile', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateDriverLocation({ latitude, longitude, token }) {
  return request('/api/driver/update-location', {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ latitude, longitude }),
  });
}

export async function getAllWaiting(token) {
  return request('/api/driver/route/all-waiting', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

// Returns ALL stops on the route with stop_lat / stop_lon
// Used once on mount to draw the full route polyline on the map
export async function getRouteStops(token) {
  return request('/api/driver/route/stops', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function markStopReached({ stopId, latitude, longitude, token }) {
  return request('/api/driver/route/stop-reached', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ stop_id: stopId, latitude, longitude }),
  });
}
