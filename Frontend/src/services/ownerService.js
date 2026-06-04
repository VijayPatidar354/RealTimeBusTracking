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

// ── Session ────────────────────────────────────────────────────────
const OWNER_TOKEN_KEY = 'busTrackOwnerToken';
const OWNER_INFO_KEY  = 'busTrackOwnerInfo';

export function saveOwnerSession(token, owner) {
  localStorage.setItem(OWNER_TOKEN_KEY, token);
  localStorage.setItem(OWNER_INFO_KEY, JSON.stringify(owner));
}

export function readOwnerSession() {
  return {
    token: localStorage.getItem(OWNER_TOKEN_KEY) || null,
    owner: JSON.parse(localStorage.getItem(OWNER_INFO_KEY) || 'null'),
  };
}

export function clearOwnerSession() {
  localStorage.removeItem(OWNER_TOKEN_KEY);
  localStorage.removeItem(OWNER_INFO_KEY);
}

// ── Auth ───────────────────────────────────────────────────────────
export async function loginOwner({ email, password }) {
  return request('/api/owner/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
}

export async function registerOwner({ owner_name, email, password }) {
  return request('/api/owner/register', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ owner_name, email, password }),
  });
}

// ── Buses ──────────────────────────────────────────────────────────
export async function getMyBuses(token) {
  return request('/api/owner/buses', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createBus({ bus_number, bus_type, token }) {
  return request('/api/owner/buses', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ bus_number, bus_type }),
  });
}

export async function assignDriver({ busId, driver_id, token }) {
  return request(`/api/owner/buses/${busId}/assign-driver`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ driver_id }),
  });
}

export async function assignRoute({ busId, route_id, token }) {
  return request(`/api/owner/buses/${busId}/assign-route`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ route_id }),
  });
}

// ── Routes ─────────────────────────────────────────────────────────
export async function getMyRoutes(token) {
  return request('/api/owner/routes', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getMyRouteById({ routeId, token }) {
  return request(`/api/owner/routes/${routeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function createRoute({ route_name, source, destination, token }) {
  return request('/api/owner/routes', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ route_name, source, destination }),
  });
}

export async function addStop({ routeId, stop_name, stop_order, stop_lat, stop_lon, token }) {
  return request(`/api/owner/routes/${routeId}/stops`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({ stop_name, stop_order, stop_lat, stop_lon }),
  });
}

export { ApiError };
