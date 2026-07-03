import type { ReactNode } from 'react';

// Card container replacing Tremor's <Card> (same look: rounded, white/neutral-900,
// ring, subtle shadow). Optional title rendered as the standard chart heading.
export function ChartCard({ title, className = '', children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`overflow-visible rounded-lg bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800 ${className}`}>
      {title && <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</p>}
      {children}
    </div>
  );
}
