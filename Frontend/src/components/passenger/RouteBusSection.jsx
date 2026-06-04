import { BusFront, MapPin, Navigation } from 'lucide-react';
import BusResultCard from './BusResultCard.jsx';

function RouteBusSection({
  route,
  selectedRouteId,
  selectedBusId,
  onSelectBus,
  onWaitingClick,
  isAuthenticated,
  waitingBusId,
  activeWaitingBusId,  // bus_id of the bus the passenger is currently waiting for
}) {
  const buses        = route.all_buses || [];
  const selectedRoute = Number(route.route_id) === Number(selectedRouteId);

  return (
    <section className="surface-panel overflow-hidden">
      <div className="border-b border-ink-200 bg-ink-50/70 p-4 dark:border-white/10 dark:bg-ink-950/50">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-ink-950 dark:text-white">
                {route.route_name}
              </h3>
              <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
                {buses.length} active {buses.length === 1 ? 'bus' : 'buses'}
              </span>
              {selectedRoute ? (
                <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-200">
                  Selected route
                </span>
              ) : null}
            </div>
            <div className="mt-3 grid gap-2 text-sm text-ink-600 dark:text-ink-300 sm:grid-cols-2">
              <span className="flex min-w-0 items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
                <span className="truncate">{route.source_stop}</span>
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <Navigation className="h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
                <span className="truncate">{route.destination_stop}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {buses.length ? (
        <div className="space-y-3 p-3">
          {buses.map((bus) => (
            <BusResultCard
              key={bus.bus_id}
              bus={{
                ...bus,
                route_id:         route.route_id,
                route_name:       route.route_name,
                source_stop:      route.source_stop,
                destination_stop: route.destination_stop,
              }}
              selected={Number(bus.bus_id) === Number(selectedBusId)}
              onSelect={onSelectBus}
              onWaitingClick={(selectedBus) => onWaitingClick?.(selectedBus, route)}
              isAuthenticated={isAuthenticated}
              waitingBusy={Number(waitingBusId) === Number(bus.bus_id)}
              isActiveWaiting={Number(activeWaitingBusId) === Number(bus.bus_id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 text-sm text-ink-600 dark:text-ink-300">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink-100 text-ink-600 dark:bg-white/10 dark:text-ink-200">
            <BusFront className="h-5 w-5" aria-hidden="true" />
          </span>
          No live buses are currently available for this route.
        </div>
      )}
    </section>
  );
}

export default RouteBusSection;
