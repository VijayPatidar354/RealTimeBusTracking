import { useEffect, useMemo, useRef, useState } from 'react';
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

  // Keep latest routeIds in a ref so the connect handler always joins the latest set
  const routeIdsRef = useRef(stableRouteIds);
  routeIdsRef.current = stableRouteIds;

  // Keep latest callbacks in a ref to prevent listener thrashing
  const callbacksRef = useRef({
    onLocationUpdated,
    onEtaUpdated,
    onWaitingUpdated,
    onStopReached,
    onNextStopUpdated,
  });

  useEffect(() => {
    callbacksRef.current = {
      onLocationUpdated,
      onEtaUpdated,
      onWaitingUpdated,
      onStopReached,
      onNextStopUpdated,
    };
  });

  // Persistent connection lifecycle and event dispatching
  useEffect(() => {
    const joinCurrentRoutes = () => {
      const currentIds = routeIdsRef.current;
      if (socket.connected && currentIds && currentIds.length > 0) {
        currentIds.forEach((routeId) => {
          socket.emit(socketEvents.passenger.joinRoute, { routeId });
        });
      }
    };

    const handleConnect = () => {
      setStatus({ connected: true, reconnecting: false, error: null });
      joinCurrentRoutes();
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
        error: error?.message || 'Connection error',
      });
    };

    // Event forwarders using latest callback refs
    const handleLocationUpdate = (payload) => {
      callbacksRef.current.onLocationUpdated?.(payload);
    };

    const handleEtaUpdate = (payload) => {
      callbacksRef.current.onEtaUpdated?.(payload);
    };

    const handleWaitingUpdate = (payload) => {
      callbacksRef.current.onWaitingUpdated?.(payload);
    };

    const handleStopReachedEvent = (payload) => {
      callbacksRef.current.onStopReached?.(payload);
    };

    const handleNextStopUpdate = (payload) => {
      callbacksRef.current.onNextStopUpdated?.(payload);
    };

    socket.on(socketEvents.connection.connect, handleConnect);
    socket.on(socketEvents.connection.disconnect, handleDisconnect);
    socket.io.on(socketEvents.connection.reconnectAttempt, handleReconnectAttempt);
    socket.on(socketEvents.connection.connectError, handleConnectError);

    socket.on(socketEvents.passenger.busLocationUpdated, handleLocationUpdate);
    socket.on(socketEvents.passenger.etaUpdated, handleEtaUpdate);
    socket.on(socketEvents.passenger.waitingUpdated, handleWaitingUpdate);
    socket.on(socketEvents.passenger.stopReached, handleStopReachedEvent);
    socket.on(socketEvents.passenger.nextStopUpdated, handleNextStopUpdate);

    if (!socket.connected) {
      socket.connect();
    } else {
      handleConnect();
    }

    return () => {
      socket.off(socketEvents.connection.connect, handleConnect);
      socket.off(socketEvents.connection.disconnect, handleDisconnect);
      socket.io.off(socketEvents.connection.reconnectAttempt, handleReconnectAttempt);
      socket.off(socketEvents.connection.connectError, handleConnectError);

      socket.off(socketEvents.passenger.busLocationUpdated, handleLocationUpdate);
      socket.off(socketEvents.passenger.etaUpdated, handleEtaUpdate);
      socket.off(socketEvents.passenger.waitingUpdated, handleWaitingUpdate);
      socket.off(socketEvents.passenger.stopReached, handleStopReachedEvent);
      socket.off(socketEvents.passenger.nextStopUpdated, handleNextStopUpdate);
    };
  }, []);

  // When stableRouteIds changes while connected, join the new route rooms
  useEffect(() => {
    if (socket.connected && stableRouteIds.length > 0) {
      stableRouteIds.forEach((routeId) => {
        socket.emit(socketEvents.passenger.joinRoute, { routeId });
      });
    }
  }, [stableRouteIds]);

  return status;
}
