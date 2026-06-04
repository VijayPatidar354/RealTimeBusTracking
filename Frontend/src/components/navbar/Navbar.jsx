import { Menu, Moon, Sun } from 'lucide-react';

function Navbar({
  title,
  onMenuClick,
  darkMode,
  onToggleDarkMode,
  actions = null,
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-ink-200 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/80">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            className="focus-ring rounded-lg p-2 text-ink-600 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-white/10 lg:hidden"
            onClick={onMenuClick}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm text-ink-500 dark:text-ink-400">
              BusTrack Console
            </p>
            <h1 className="truncate text-lg font-semibold text-ink-950 dark:text-white">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-ink-200 bg-white text-ink-700 hover:bg-ink-100 dark:border-white/10 dark:bg-ink-900 dark:text-ink-200 dark:hover:bg-white/10"
            onClick={onToggleDarkMode}
            aria-label="Toggle dark mode"
          >
            {darkMode ? (
              <Sun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
