import { NavLink } from 'react-router-dom';
import { createElement } from 'react';
import { BusFront, X } from 'lucide-react';

function Sidebar({ title, subtitle, items, isOpen, onClose }) {
  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-ink-950/45 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-ink-200 bg-white shadow-soft transition-transform duration-300 dark:border-white/10 dark:bg-ink-900 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label={`${title} navigation`}
      >
        <div className="flex h-16 items-center justify-between border-b border-ink-200 px-5 dark:border-white/10">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
              <BusFront className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink-950 dark:text-white">
                {title}
              </p>
              <p className="truncate text-xs text-ink-500 dark:text-ink-400">
                {subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="focus-ring rounded-lg p-2 text-ink-500 hover:bg-ink-100 dark:text-ink-300 dark:hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {items.map(({ label, href, icon }) => (
            <NavLink
              key={`${href}-${label}`}
              to={href}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200'
                    : 'text-ink-600 hover:bg-ink-100 hover:text-ink-950 dark:text-ink-300 dark:hover:bg-white/10 dark:hover:text-white'
                }`
              }
            >
              {createElement(icon, {
                className: 'h-5 w-5 shrink-0',
                'aria-hidden': true,
              })}
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

export default Sidebar;
