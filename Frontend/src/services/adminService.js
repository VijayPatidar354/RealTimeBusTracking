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
const ADMIN_TOKEN_KEY = 'busTrackAdminToken';
const ADMIN_INFO_KEY  = 'busTrackAdminInfo';

export function saveAdminSession(token, admin) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
  localStorage.setItem(ADMIN_INFO_KEY, JSON.stringify(admin));
}

export function readAdminSession() {
  return {
    token: localStorage.getItem(ADMIN_TOKEN_KEY) || null,
    admin: JSON.parse(localStorage.getItem(ADMIN_INFO_KEY) || 'null'),
  };
}

export function clearAdminSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_INFO_KEY);
}

// ── Auth ───────────────────────────────────────────────────────────
export async function loginAdmin({ email, password }) {
  return request('/api/admin/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password }),
  });
}

// ── Data ───────────────────────────────────────────────────────────
export async function getSystemStats(token) {
  return request('/api/admin/stats', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getAllBuses(token) {
  return request('/api/admin/buses', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getAllDrivers(token) {
  return request('/api/admin/drivers', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getAllRoutes(token) {
  return request('/api/admin/routes', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getRouteById({ routeId, token }) {
  return request(`/api/admin/routes/${routeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getAllOwners(token) {
  return request('/api/admin/owners', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getWaitingOverview(token) {
  return request('/api/admin/waiting', {
    headers: { Authorization: `Bearer ${token}` },
  });
}
