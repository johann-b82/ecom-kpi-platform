'use client';
import { Fragment, useMemo, useState } from 'react';
import type { BpmProduct } from '@/brickpm/types';
import { eur, pct } from '@/brickpm/format';
import { BpmChip } from './BpmChip';

const selectClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';
const th = 'px-3 py-2 text-left font-semibold text-neutral-500';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

export function BpmSortiment({ products }: { products: BpmProduct[] }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const cats = useMemo(() => Array.from(new Set(products.map((p) => p.cat))).sort(), [products]);
  const stati = useMemo(() => Array.from(new Set(products.map((p) => p.status))).sort(), [products]);

  const rows = products.filter((p) => {
    const needle = q.trim().toLowerCase();
    if (needle && !`${p.id} ${p.name}`.toLowerCase().includes(needle)) return false;
    if (cat && p.cat !== cat) return false;
    if (status && p.status !== status) return false;
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${selectClass} flex-1 min-w-[180px]`} placeholder="Suche (Name / ID)" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={selectClass} value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">Alle Kategorien</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Alle Status</option>
          {stati.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
        <table className="w-full border-collapse text-sm tabular-nums">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider dark:border-neutral-800 dark:bg-neutral-950">
            <tr>
              <th className={th}>ID</th><th className={th}>Name</th><th className={th}>Kategorie</th>
              <th className={th}>Status</th><th className={th}>Bestand</th><th className={th}>UVP</th>
              <th className={th}>Preis</th><th className={th}>Marge</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <Fragment key={p.id}>
                <tr
                  onClick={() => setOpen(open === p.id ? null : p.id)}
                  className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 dark:border-neutral-800/60 dark:hover:bg-neutral-800/40"
                >
                  <td className={`${td} font-mono text-xs`}>{p.id}</td>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{p.cat}</td>
                  <td className={td}><BpmChip label={p.status} /></td>
                  <td className={td}>
                    <span className={p.stock < p.minStock ? 'font-semibold text-red-600 dark:text-red-400' : ''}>{p.stock}</span>
                    <span className="text-neutral-400"> / {p.minStock}</span>
                  </td>
                  <td className={td}>{eur(p.uvp)}</td>
                  <td className={td}>{eur(p.price)}</td>
                  <td className={td}>{p.price > 0 ? pct((p.price - p.cost) / p.price) : '—'}</td>
                </tr>
                {open === p.id && (
                  <tr className="border-b border-neutral-100 bg-neutral-50 dark:border-neutral-800/60 dark:bg-neutral-950">
                    <td className={td} colSpan={8}>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-3">
                        <div><span className="text-neutral-500">Serie:</span> {p.series}</div>
                        <div><span className="text-neutral-500">Jahr:</span> {p.year}</div>
                        <div><span className="text-neutral-500">Teile:</span> {p.parts}</div>
                        <div><span className="text-neutral-500">Kanal:</span> {p.channel}</div>
                        <div><span className="text-neutral-500">Nachfolger:</span> {p.succ ?? '—'}</div>
                        <div><span className="text-neutral-500">Zeitraum:</span> {p.validFrom ?? '—'} – {p.validTo ?? 'offen'}</div>
                      </div>
                      <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">{p.descr}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr><td className={`${td} text-neutral-500`} colSpan={8}>Keine Produkte gefunden.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
