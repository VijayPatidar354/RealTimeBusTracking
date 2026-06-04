import { useEffect, useMemo, useState } from 'react';
import { socket, socketEvents } from '../sockets/socket.js';

const initialStatus = {
  connected: socket.connected,
  reconnecting: false,
  error: null,
};

export function usePassengerSocket({
  routeIds = [],
  onLocationUpdated,
  onEtaUpdated,
  onWaitingUpdated,   // waiting:updated  — count changed at a stop
  onStopReached,      // stop:reached     — bus arrived, show "Did you board?" prompt
  onNextStopUpdated,  // next-stop-updated
}) {
  const [status, setStatus] = useState(initialStatus);
  const routeKey = Array.from(new Set(routeIds.filter(Boolean).map(Number)))
    .sort((a, b) => a - b)
    .join(',');

  const stableRouteIds = useMemo(
    () => (routeKey ? routeKey.split(',').map(Number) : []),
    [routeKey],
  );

  useEffect(() => {
    if (!stableRouteIds.length) {
      return undefined;
    }

    const joinRoutes = () => {
      stableRouteIds.forEach((routeId) => {
        socket.emit(socketEvents.passenger.joinRoute, { routeId });
      });
    };

    const handleConnect = () => {
      setStatus({ connected: true, reconnecting: false, error: null });
      joinRoutes();
    };

    const handleDisconnect = () => {
      setStatus((current) => ({
        ...current,
        connected: false,
        reconnecting: true,
      }));
    };

    const handleReconnectAttempt = () => {
      setStatus((current) => ({
        ...current,
        connected: false,
        reconnecting: true,
      }));
    };

    const handleConnectError = (error) => {
      setStatus({
        connected: false,
        reconnecting: true,
        error: error.message,
      });
    };

    // safe no-op fallbacks so socket.on never receives undefined
    const safeLocationUpdated  = onLocationUpdated  || (() => {});
    const safeEtaUpdated       = onEtaUpdated       || (() => {});
    const safeWaitingUpdated   = onWaitingUpdated   || (() => {});
    const safeStopReached      = onStopReached      || (() => {});
    const safeNextStopUpdated  = onNextStopUpdated  || (() => {});

    socket.on(socketEvents.connection.connect,    handleConnect);
    socket.on(socketEvents.connection.disconnect, handleDisconnect);
    socket.io.on(socketEvents.connection.reconnectAttempt, handleReconnectAttempt);
    socket.on(socketEvents.connection.connectError, handleConnectError);

    socket.on(socketEvents.passenger.busLocationUpdated, safeLocationUpdated);
    socket.on(socketEvents.passenger.etaUpdated,         safeEtaUpdated);
    socket.on('waiting:updated',                         safeWaitingUpdated);
    socket.on('stop:reached',                            safeStopReached);
    socket.on('next-stop-updated',                       safeNextStopUpdated);

    if (!socket.connected) {
      socket.connect();
    } else {
      handleConnect();
    }

    return () => {
      socket.off(socketEvents.connection.connect,    handleConnect);
      socket.off(socketEvents.connection.disconnect, handleDisconnect);
      socket.io.off(socketEvents.connection.reconnectAttempt, handleReconnectAttempt);
      socket.off(socketEvents.connection.connectError, handleConnectError);

      socket.off(socketEvents.passenger.busLocationUpdated, safeLocationUpdated);
      socket.off(socketEvents.passenger.etaUpdated,         safeEtaUpdated);
      socket.off('waiting:updated',                         safeWaitingUpdated);
      socket.off('stop:reached',                            safeStopReached);
      socket.off('next-stop-updated',                       safeNextStopUpdated);
    };
  }, [stableRouteIds, onLocationUpdated, onEtaUpdated, onWaitingUpdated, onStopReached, onNextStopUpdated]);

  return status;
}
