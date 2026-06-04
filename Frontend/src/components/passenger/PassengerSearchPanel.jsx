import { Loader2, RotateCcw, Search } from 'lucide-react';

function PassengerSearchPanel({
  from,
  to,
  onFromChange,
  onToChange,
  onSubmit,
  onClear,
  loading,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="surface-panel overflow-hidden bg-white/90 p-4 dark:bg-ink-900/95 sm:p-5"
    >
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-ink-500 dark:text-ink-400">
            From
          </span>
          <input
            value={from}
            onChange={(event) => onFromChange(event.target.value)}
            placeholder="Source stop"
            className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 outline-none transition-all duration-200 placeholder:text-ink-400 hover:border-brand-300 focus:border-brand-500 dark:border-white/10 dark:bg-ink-950 dark:text-white dark:placeholder:text-ink-500"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-normal text-ink-500 dark:text-ink-400">
            To
          </span>
          <input
            value={to}
            onChange={(event) => onToChange(event.target.value)}
            placeholder="Destination stop"
            className="focus-ring mt-2 h-12 w-full rounded-lg border border-ink-200 bg-ink-50 px-4 text-sm font-medium text-ink-950 outline-none transition-all duration-200 placeholder:text-ink-400 hover:border-brand-300 focus:border-brand-500 dark:border-white/10 dark:bg-ink-950 dark:text-white dark:placeholder:text-ink-500"
          />
        </label>

        <button
          type="submit"
          disabled={loading || !from.trim() || !to.trim()}
          className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-panel hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-ink-300 disabled:text-ink-500 dark:disabled:bg-ink-700 dark:disabled:text-ink-400"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="h-4 w-4" aria-hidden="true" />
          )}
          Search
        </button>

        <button
          type="button"
          onClick={onClear}
          disabled={loading && !from && !to}
          className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-5 text-sm font-semibold text-ink-700 hover:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-white/10"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Clear
        </button>
      </div>
    </form>
  );
}

export default PassengerSearchPanel;
