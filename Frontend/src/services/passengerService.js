const API_BASE_URL = import.meta.env.DEV
  ? ''
  : import.meta.env.VITE_API_BASE_URL || '';

class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

function buildUrl(path, params = {}) {
  const url = new URL(path, API_BASE_URL || window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, value);
    }
  });

  if (!API_BASE_URL) {
    return `${url.pathname}${url.search}`;
  }

  return url.toString();
}

async function request(path, options = {}) {
  const { params, ...fetchOptions } = options;
  const response = await fetch(buildUrl(path, params), {
    headers: {
      Accept: 'application/json',
      ...fetchOptions.headers,
    },
    ...fetchOptions,
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

export async function searchPassengerRoutes({ from, to }) {
  return request('/api/passenger/search-route', {
    params: { from: from.trim(), to: to.trim() },
  });
}

export async function getRouteETA(routeId) {
  return request(`/api/passenger/routes/${routeId}/eta`);
}

export async function getPassengerRoute(routeId) {
  return request(`/api/passenger/routes/${routeId}`);
}

export async function registerPassengerWaiting({ routeId, stopId, token }) {
  return request('/api/passenger/waiting', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      route_id: routeId,
      stop_id: stopId,
    }),
  });
}

export async function registerWaitingAtStopName({ routeId, stopName, token }) {
  const data = await getPassengerRoute(routeId);
  const stop = data.route?.stops?.find(
    (candidate) =>
      candidate.stop_name?.toLowerCase() === stopName?.toLowerCase(),
  );

  if (!stop) {
    throw new ApiError(`Stop "${stopName}" was not found on this route.`, 404);
  }

  return registerPassengerWaiting({
    routeId,
    stopId: stop.id,
    token,
  });
}

// Called when passenger taps "Yes, I boarded"
// waitingId = passenger_waiting.id returned from registerPassengerWaiting
export async function confirmBoarded({ waitingId, token }) {
  return request(`/api/passenger/waiting/${waitingId}/board`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

// Called when passenger taps "Cancel Waiting"
// waitingId = passenger_waiting.id returned from registerPassengerWaiting
export async function cancelWaiting({ waitingId, token }) {
  return request(`/api/passenger/waiting/${waitingId}/cancel`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export { ApiError };

export async function getAllRoutes() {
  return request('/api/passenger/routes');
}

export async function getLiveBuses() {
  return request('/api/passenger/buses/live');
}

export async function getMyWaiting({ token }) {
  return request('/api/passenger/my-waiting', {
    headers: { Authorization: `Bearer ${token}` },
  });
}
