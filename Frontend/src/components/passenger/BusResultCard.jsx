import { BusFront, Gauge, Loader2, MapPin, Navigation, Radio } from 'lucide-react';
import LiveEtaChip from './LiveEtaChip.jsx';

function BusResultCard({
  bus,
  selected,
  onSelect,
  waitingBusy,       // true while THIS bus's register request is in flight
  onWaitingClick,
  isAuthenticated,
  isActiveWaiting,   // true if passenger already has a waiting entry for this bus
}) {
  const waitingLabel = () => {
    if (waitingBusy)      return null;               // handled by spinner below
    if (isActiveWaiting)  return 'Waiting ✓';
    if (isAuthenticated)  return "I'm Waiting";
    return 'Login to Wait';
  };

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onSelect(bus)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(bus);
        }
      }}
      className={`group w-full rounded-lg border p-4 text-left shadow-panel transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft ${
        selected
          ? 'border-brand-500 bg-brand-50/80 ring-2 ring-brand-500/20 dark:border-brand-300 dark:bg-brand-500/10'
          : 'border-ink-200 bg-white/90 hover:border-brand-300 dark:border-white/10 dark:bg-ink-900/90 dark:hover:border-brand-400/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
              <BusFront className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h4 className="truncate text-base font-semibold text-ink-950 dark:text-white">
                Bus {bus.bus_number || bus.bus_id}
              </h4>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {bus.bus_type || 'Active passenger bus'}
              </p>
            </div>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            selected
              ? 'bg-brand-600 text-white'
              : 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200'
          }`}
        >
          <Radio className="h-3 w-3" aria-hidden="true" />
          {selected ? 'Selected' : 'Live'}
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
          <p className="flex items-center gap-2 text-xs font-medium text-ink-500 dark:text-ink-400">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            From
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-ink-950 dark:text-white">
            {bus.source_stop}
          </p>
        </div>
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
          <p className="flex items-center gap-2 text-xs font-medium text-ink-500 dark:text-ink-400">
            <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
            To
          </p>
          <p className="mt-2 truncate text-sm font-semibold text-ink-950 dark:text-white">
            {bus.destination_stop}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">ETA to source</p>
          <div className="mt-2">
            <LiveEtaChip minutes={bus.eta_to_source_minutes} />
          </div>
        </div>
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
          <p className="text-xs font-medium text-ink-500 dark:text-ink-400">ETA to destination</p>
          <div className="mt-2">
            <LiveEtaChip minutes={bus.eta_to_destination_minutes} />
          </div>
        </div>
        <div className="rounded-lg bg-ink-50 p-3 dark:bg-ink-950/70">
          <p className="flex items-center gap-2 text-xs font-medium text-ink-500 dark:text-ink-400">
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            Speed
          </p>
          <p className="mt-2 text-sm font-semibold text-ink-950 dark:text-white">
            {bus.current_speed_kmph
              ? `${Math.round(bus.current_speed_kmph)} km/h`
              : 'Pending'}
          </p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect?.(bus);
          }}
          className="flex-1 rounded-2xl bg-zinc-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-black dark:bg-white dark:text-black"
        >
          {selected ? 'Selected' : 'View Live'}
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (!isActiveWaiting) onWaitingClick?.(bus);
          }}
          disabled={waitingBusy || isActiveWaiting}
          className={`flex-1 rounded-2xl px-4 py-3 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
            isActiveWaiting
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {waitingBusy ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Registering...
            </span>
          ) : (
            waitingLabel()
          )}
        </button>
      </div>
    </article>
  );
}

export default BusResultCard;
