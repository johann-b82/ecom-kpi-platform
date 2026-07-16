'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDeDate } from '@/lib/dates';
import { RANGE_OPTIONS } from '@/lib/range';

export function Filters({ range, basePath = '/dashboard' }:
  { range?: { start: string; end: string }; basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const active = params.get('days') ?? '30';
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {RANGE_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => router.push(`${basePath}?days=${o.key}`)}
            className={`rounded px-3 py-1 text-sm ${active === o.key ? 'bg-brand text-white' : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
      {range && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {formatDeDate(range.start)} – {formatDeDate(range.end)}
        </span>
      )}
    </div>
  );
}
