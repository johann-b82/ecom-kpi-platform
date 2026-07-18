'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { Sort } from '@/lib/sort';
import { compareValues } from '@/lib/client-sort';
import { matchesText, inNumberRange } from '@/lib/data-table';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  sort?: (row: T) => string | number | null | undefined;
  filter?:
    | { kind: 'text'; value: (row: T) => string }
    | { kind: 'select'; value: (row: T) => string; options: { value: string; label: string }[] }
    | { kind: 'number'; value: (row: T) => number };
};

type FilterVal = { text?: string; select?: string; min?: string; max?: string };

const inputCls =
  'w-full rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function DataTable<T>({ rows, columns, rowKey, initialSort, empty = 'Keine Einträge.' }:
  { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; initialSort?: Sort; empty?: string }) {
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, FilterVal>>({});
  const hasFilterRow = columns.some((c) => c.filter);

  const setF = (key: string, patch: Partial<FilterVal>) =>
    setFilters((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  const filtered = useMemo(() => rows.filter((row) =>
    columns.every((c) => {
      const fv = filters[c.key];
      if (!c.filter || !fv) return true;
      if (c.filter.kind === 'text') return matchesText(c.filter.value(row), fv.text ?? '');
      if (c.filter.kind === 'select') return !fv.select || c.filter.value(row) === fv.select;
      const min = fv.min ? Number(fv.min) : undefined;
      const max = fv.max ? Number(fv.max) : undefined;
      return inNumberRange(c.filter.value(row), min, max);
    })), [rows, columns, filters]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.col);
    if (!col?.sort) return filtered;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = col.sort!(a);
      const bv = col.sort!(b);
      // Leere Werte immer ans Ende — unabhängig von der Sortierrichtung.
      const aEmpty = av === null || av === undefined;
      const bEmpty = bv === null || bv === undefined;
      if (aEmpty || bEmpty) return compareValues(av, bv);
      return compareValues(av, bv) * factor;
    });
  }, [filtered, sort, columns]);

  const onSort = (key: string) =>
    setSort((s) => (s && s.col === key && s.dir === 'asc' ? { col: key, dir: 'desc' } : { col: key, dir: 'asc' }));

  return (
    <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-2 ${c.className ?? ''}`}>
                {c.sort ? (
                  <button onClick={() => onSort(c.key)}
                    className="anno inline-flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200">
                    {c.header}
                    <span className="text-[10px] leading-none">
                      {sort?.col === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                ) : <span className="anno">{c.header}</span>}
              </th>
            ))}
          </tr>
          {hasFilterRow && (
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 align-top">
                  {c.filter?.kind === 'text' && (
                    <input className={inputCls} placeholder="Filter …"
                      value={filters[c.key]?.text ?? ''} onChange={(e) => setF(c.key, { text: e.target.value })} />
                  )}
                  {c.filter?.kind === 'select' && (
                    <select className={inputCls}
                      value={filters[c.key]?.select ?? ''} onChange={(e) => setF(c.key, { select: e.target.value })}>
                      <option value="">Alle</option>
                      {c.filter.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {c.filter?.kind === 'number' && (
                    <div className="flex gap-1">
                      <input className={inputCls} inputMode="numeric" placeholder="min"
                        value={filters[c.key]?.min ?? ''} onChange={(e) => setF(c.key, { min: e.target.value })} />
                      <input className={inputCls} inputMode="numeric" placeholder="max"
                        value={filters[c.key]?.max ?? ''} onChange={(e) => setF(c.key, { max: e.target.value })} />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
              {columns.map((c) => <td key={c.key} className={`px-4 py-2 ${c.className ?? ''}`}>{c.cell(row)}</td>)}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-neutral-500">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
