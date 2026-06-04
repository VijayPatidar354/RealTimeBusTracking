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
  passenger: {
    joinRoute: 'join:route',
    busLocationUpdated: 'bus:location_updated',
    etaUpdated: 'eta-updated',
  },
  driver: {},
  owner: {},
  admin: {},
});

export default socket;
