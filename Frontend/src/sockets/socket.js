import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.DEV
  ? undefined
  : import.meta.env.VITE_SOCKET_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    undefined;

export const socket = io(SOCKET_URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  transports: ['websocket', 'polling'],
});

export const socketEvents = Object.freeze({
  connection: {
    connect: 'connect',
    disconnect: 'disconnect',
    connectError: 'connect_error',
    reconnectAttempt: 'reconnect_attempt',
  },
  // Events emitted by the server that any dashboard role may receive
  bus: {
    locationUpdated:  'bus:location_updated',
    routeAssigned:    'bus:route_assigned',
    statusUpdated:    'bus:status_updated',
    tripCompleted:    'trip:completed',
    etaUpdated:       'eta-updated',
    nextStopUpdated:  'next-stop-updated',
    routeWaitingUpdated: 'route-waiting-updated',
    waitingUpdated:   'waiting:updated',
    stopReached:      'stop:reached',
  },
  // Passenger-specific (join + listening convenience aliases pointing to bus.*)
  passenger: {
    joinRoute:         'join:route',
    busLocationUpdated: 'bus:location_updated',
    etaUpdated:        'eta-updated',
    waitingUpdated:    'waiting:updated',
    stopReached:       'stop:reached',
    nextStopUpdated:   'next-stop-updated',
    tripCompleted:     'trip:completed',
    busRouteAssigned:  'bus:route_assigned',
  },
  driver: {
    joinDriver: 'join:driver',
  },
  owner: {
    joinOwner: 'join:owner',
  },
  admin: {
    joinAdmin: 'join:admin',
  },
});

export default socket;
