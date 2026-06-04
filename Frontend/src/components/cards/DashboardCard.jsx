function DashboardCard({
  title,
  value,
  description,
  icon: Icon,
  accent = 'brand',
}) {
  const accentStyles = {
    brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200',
    blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-200',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-200',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-200',
  };

  return (
    <article className="surface-panel p-5 animate-slide-in">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-500 dark:text-ink-400">
            {title}
          </p>
          <p className="mt-3 text-2xl font-semibold tracking-normal text-ink-950 dark:text-white">
            {value}
          </p>
        </div>
        {Icon ? (
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accentStyles[accent]}`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
      {description ? (
        <p className="mt-4 text-sm leading-6 text-ink-600 dark:text-ink-300">
          {description}
        </p>
      ) : null}
    </article>
  );
}

export default DashboardCard;
