import { STATUS_TONE } from '@/brickpm/format';

const TONE: Record<string, string> = {
  red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  neutral: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
};

export function BpmChip({ label }: { label: string }) {
  const cls = TONE[STATUS_TONE[label] ?? 'neutral'];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}
