import { Clock3 } from 'lucide-react';
import { formatEta, getEtaTone } from '../../utils/passengerRealtime.js';

const toneStyles = {
  active:
    'bg-brand-50 text-brand-800 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-100 dark:ring-brand-400/30',
  warning:
    'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-100 dark:ring-amber-400/30',
  danger:
    'bg-rose-50 text-rose-800 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-100 dark:ring-rose-400/30',
  neutral:
    'bg-ink-100 text-ink-700 ring-ink-500/15 dark:bg-white/10 dark:text-ink-100 dark:ring-white/10',
};

function LiveEtaChip({ minutes, label }) {
  const tone = getEtaTone(minutes);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ring-inset transition-all duration-300 ${toneStyles[tone]}`}
    >
      <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
      {label ? <span className="text-ink-500 dark:text-ink-300">{label}</span> : null}
      <span>{formatEta(minutes)}</span>
    </span>
  );
}

export default LiveEtaChip;
