const API_BASE_URL = import.meta.env.DEV
  ? ''
  : import.meta.env.VITE_API_BASE_URL || '';
const TOKEN_KEY = 'busTrackPassengerToken';
const PASSENGER_KEY = 'busTrackPassengerProfile';

class AuthError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(path) {
  if (!API_BASE_URL) {
    return path;
  }

  return new URL(path, API_BASE_URL).toString();
}

async function authRequest(path, options = {}) {
  const response = await fetch(buildUrl(path), {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.success === false) {
    throw new AuthError(
      payload?.message || `Request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload;
}

function decodeToken(token) {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(window.atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export async function registerPassengerAccount(values) {
  return authRequest('/api/passenger/register', {
    method: 'POST',
    body: JSON.stringify({
      passenger_name: values.passengerName,
      phone: values.phone,
      email: values.email,
      password: values.password,
    }),
  });
}

export async function loginPassengerAccount({ email, password }) {
  const data = await authRequest('/api/passenger/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  const tokenPayload = decodeToken(data.token);
  return {
    token: data.token,
    passenger: {
      passengerId: tokenPayload?.passengerId,
      email,
    },
  };
}

export function savePassengerSession({ token, passenger }) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(PASSENGER_KEY, JSON.stringify(passenger || {}));
}

export function readPassengerSession() {
  const token = window.localStorage.getItem(TOKEN_KEY);
  const passengerText = window.localStorage.getItem(PASSENGER_KEY);

  if (!token) {
    return { token: null, passenger: null };
  }

  return {
    token,
    passenger: passengerText ? JSON.parse(passengerText) : decodeToken(token),
  };
}

export function clearPassengerSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(PASSENGER_KEY);
}

export { AuthError };
