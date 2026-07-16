'use client';
import { useMemo, useState } from 'react';
import type { Sort } from '@/lib/sort';
import { compareValues } from '@/lib/client-sort';

type Accessor<T> = (row: T) => string | number | null | undefined;

// Client-seitige Tabellensortierung für vollständig geladene Listen (Katalog,
// Offene Posten …). Spiegelt die Bedienung der server-seitigen SortableTh.
export function useClientSort<T>(rows: T[], accessors: Record<string, Accessor<T>>, fallback: Sort) {
  const [sort, setSort] = useState<Sort>(fallback);
  const sorted = useMemo(() => {
    const acc = accessors[sort.col];
    if (!acc) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => compareValues(acc(a), acc(b)) * factor);
  }, [rows, sort, accessors]);
  const onSort = (col: string) =>
    setSort((s) => (s.col === col && s.dir === 'asc' ? { col, dir: 'desc' } : { col, dir: 'asc' }));
  return { sorted, sort, onSort };
}

export function ClientSortableTh(
  { col, label, sort, onSort, className }:
  { col: string; label: string; sort: Sort; onSort: (col: string) => void; className?: string },
) {
  const active = sort.col === col;
  return (
    <th className={className}>
      <button onClick={() => onSort(col)}
        className="anno inline-flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200">
        {label}
        <span className="text-[10px] leading-none">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
