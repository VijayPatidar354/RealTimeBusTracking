const statusStyles = {
  active:
    'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-200 dark:ring-brand-400/30',
  warning:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/30',
  danger:
    'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-200 dark:ring-rose-400/30',
  neutral:
    'bg-ink-100 text-ink-700 ring-ink-500/15 dark:bg-white/10 dark:text-ink-200 dark:ring-white/10',
};

function StatusBadge({ children, tone = 'neutral', className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export default StatusBadge;
