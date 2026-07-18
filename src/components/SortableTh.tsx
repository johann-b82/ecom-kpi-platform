'use client';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { parseSort, toggleSortParam, type Sort } from '@/lib/sort';

// Sortierbarer Spaltenkopf für server-seitige Listen. Kippt den `sort`-Param
// (Whitelist in `allowed`), erhält alle übrigen Query-Parameter und springt auf
// Seite 1 zurück.
export function SortableTh(
  { col, label, allowed, fallback, className }:
  { col: string; label: string; allowed: readonly string[]; fallback: Sort; className?: string },
) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = parseSort(params.get('sort') ?? undefined, allowed, fallback);
  const active = current.col === col;
  const go = () => {
    const p = new URLSearchParams(params.toString());
    p.set('sort', toggleSortParam(current, col));
    p.delete('page');
    router.push(`${pathname}?${p.toString()}`);
  };
  return (
    <th className={className}>
      <button onClick={go}
        className="anno inline-flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200">
        {label}
        <span className="text-[10px] leading-none">{active ? (current.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}
