export function formatEta(minutes) {
  if (minutes === null || minutes === undefined) {
    return 'Delayed';
  }

  const numericMinutes = Number(minutes);
  if (Number.isNaN(numericMinutes)) {
    return 'Delayed';
  }

  if (numericMinutes <= 1) {
    return 'Arriving';
  }

  return `${Math.round(numericMinutes)} min`;
}

export function getEtaTone(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(Number(minutes))) {
    return 'danger';
  }

  if (Number(minutes) <= 3) {
    return 'active';
  }

  if (Number(minutes) <= 10) {
    return 'warning';
  }

  return 'neutral';
}

export function normalizeBusLocationUpdate(payload) {
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return null;
  }

  return {
    bus_id: payload.bus_id,
    bus_number: payload.bus_number,
    route_id: payload.route_id,
    driver_id: payload.driver_id,
    current_location: { latitude, longitude },
    timestamp: payload.timestamp,
  };
}

export function mergeLocationIntoRoutes(routes, update) {
  if (!update) {
    return routes;
  }

  return routes.map((route) => {
    if (Number(route.route_id) !== Number(update.route_id)) {
      return route;
    }

    const allBuses = route.all_buses || [];
    const hasBus = allBuses.some(
      (bus) => Number(bus?.bus_id) === Number(update.bus_id),
    );

    const mergeBus = (bus) => {
      if (Number(bus?.bus_id) !== Number(update.bus_id)) {
        return bus;
      }

      return {
        ...bus,
        bus_number: update.bus_number || bus.bus_number,
        current_location: update.current_location,
        last_location_at: update.timestamp,
      };
    };

    const nextBuses = hasBus
      ? allBuses.map(mergeBus)
      : [
          ...allBuses,
          {
            bus_id: update.bus_id,
            bus_number: update.bus_number,
            route_id: update.route_id,
            driver_id: update.driver_id,
            current_location: update.current_location,
            eta_to_source_minutes: null,
            eta_to_destination_minutes: null,
            current_speed_kmph: null,
            last_location_at: update.timestamp,
          },
        ];

    return {
      ...route,
      nearest_bus: route.nearest_bus ? mergeBus(route.nearest_bus) : null,
      all_buses: nextBuses,
    };
  });
}

export function mergeEtaIntoRoutes(routes, etaUpdate) {
  if (!etaUpdate) {
    return routes;
  }

  return routes.map((route) => {
    if (Number(route.route_id) !== Number(etaUpdate.route_id)) {
      return route;
    }

    const sourceStop = route.source_stop;
    const destinationStop = route.destination_stop;
    const upcomingStops = etaUpdate.upcoming_stops || [];
    const sourceEta = upcomingStops.find((stop) => stop.stop_name === sourceStop);
    const destinationEta = upcomingStops.find(
      (stop) => stop.stop_name === destinationStop,
    );

    const mergeBus = (bus) => {
      if (Number(bus?.bus_id) !== Number(etaUpdate.bus_id)) {
        return bus;
      }

      return {
        ...bus,
        current_speed_kmph: etaUpdate.current_speed_kmph,
        current_location: etaUpdate.current_location || bus.current_location,
        eta_to_source_minutes:
          sourceEta?.eta_minutes ?? bus.eta_to_source_minutes,
        eta_to_destination_minutes:
          destinationEta?.eta_minutes ?? bus.eta_to_destination_minutes,
        upcoming_stops: upcomingStops,
        last_eta_at: etaUpdate.timestamp,
      };
    };

    const allBuses = (route.all_buses || []).map(mergeBus);
    const nearestBus = route.nearest_bus ? mergeBus(route.nearest_bus) : null;

    return {
      ...route,
      nearest_bus: nearestBus,
      all_buses: allBuses,
      eta_minutes: nearestBus?.eta_to_source_minutes ?? route.eta_minutes,
      latest_eta: etaUpdate,
    };
  });
}

export function getRouteBuses(routes) {
  return routes.flatMap((route) =>
    (route.all_buses || []).map((bus) => ({
      ...bus,
      route_id: route.route_id,
      route_name: route.route_name,
      source_stop: route.source_stop,
      destination_stop: route.destination_stop,
      is_nearest: Number(bus.bus_id) === Number(route.nearest_bus?.bus_id),
    })),
  );
}
