function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="surface-panel flex flex-col items-center justify-center px-6 py-10 text-center">
      {Icon ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200">
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      ) : null}
      <h3 className="mt-4 text-base font-semibold text-ink-950 dark:text-white">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-ink-600 dark:text-ink-300">
        {description}
      </p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export default EmptyState;
