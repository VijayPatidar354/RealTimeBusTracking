function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-ink-200/80 dark:bg-white/10 ${className}`}
      aria-hidden="true"
    />
  );
}

export default SkeletonBlock;
