'use client';
import { useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
];

export function Filters({ range }: { range?: { start: string; end: string } }) {
  const router = useRouter();
  const params = useSearchParams();
  const active = Number(params.get('days')) || 30;
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.days}
            onClick={() => router.push(`/?days=${o.days}`)}
            className={`rounded px-3 py-1 text-sm ${active === o.days ? 'bg-brand text-white' : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {range && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {range.start} – {range.end}
        </span>
      )}
    </div>
  );
}
