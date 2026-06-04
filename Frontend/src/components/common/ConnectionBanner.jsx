import { Wifi, WifiOff } from 'lucide-react';

function ConnectionBanner({ connected, reconnecting, error }) {
  const isLive = connected && !reconnecting;

  return (
    <div
      className={`surface-panel flex items-center gap-3 px-4 py-3 ${
        isLive
          ? 'border-brand-200/80 bg-brand-50/80 dark:border-brand-400/20 dark:bg-brand-500/10'
          : 'border-amber-200 bg-amber-50 dark:border-amber-400/20 dark:bg-amber-500/10'
      }`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          isLive
            ? 'bg-brand-600 text-white'
            : 'bg-amber-500 text-white'
        }`}
      >
        {isLive ? (
          <Wifi className="h-4 w-4" aria-hidden="true" />
        ) : (
          <WifiOff className="h-4 w-4" aria-hidden="true" />
        )}
        {isLive ? (
          <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-brand-400" />
        ) : null}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink-950 dark:text-white">
          {isLive ? 'Live updates active' : 'Realtime reconnecting'}
        </p>
        <p className="truncate text-xs text-ink-600 dark:text-ink-300">
          {error || (isLive ? 'Socket connected to route rooms.' : 'Trying to restore live bus and ETA updates.')}
        </p>
      </div>
    </div>
  );
}

export default ConnectionBanner;
