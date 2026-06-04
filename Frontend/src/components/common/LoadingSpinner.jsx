function LoadingSpinner({ label = 'Loading', size = 'md', className = '' }) {
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-6 w-6 border-2',
    lg: 'h-10 w-10 border-4',
  };

  return (
    <div
      className={`inline-flex items-center gap-3 text-sm font-medium text-ink-600 dark:text-ink-300 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span
        className={`${sizes[size]} animate-spin rounded-full border-ink-200 border-t-brand-600 dark:border-ink-700 dark:border-t-brand-400`}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

export default LoadingSpinner;
