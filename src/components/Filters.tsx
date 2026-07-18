'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDeDate } from '@/lib/dates';
import { RANGE_OPTIONS } from '@/lib/range';

const btn = (active: boolean) =>
  `rounded px-3 py-1 text-sm ${active ? 'bg-brand text-white' : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'}`;
const dateInput =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function Filters({ range, basePath = '/dashboard' }:
  { range?: { start: string; end: string }; basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const hasCustom = !!(params.get('start') && params.get('end'));
  const active = hasCustom ? 'custom' : (params.get('days') ?? '30');
  const [from, setFrom] = useState(params.get('start') ?? range?.start ?? '');
  const [to, setTo] = useState(params.get('end') ?? range?.end ?? '');
  const applyCustom = () => { if (from && to) router.push(`${basePath}?start=${from}&end=${to}`); };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => router.push(`${basePath}?days=${o.key}`)} className={btn(active === o.key)}>
            {o.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} aria-label="Von" />
        <span className="text-neutral-400">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} aria-label="Bis" />
        <button onClick={applyCustom} className={btn(active === 'custom')}>Anwenden</button>
      </div>
      {range && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {formatDeDate(range.start)} – {formatDeDate(range.end)}
        </span>
      )}
    </div>
  );
}
