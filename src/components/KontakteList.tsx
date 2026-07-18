'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { SortableTh } from './SortableTh';
import { CONTACT_SORT, type ContactRow, type ContactSegment } from '@/kontakte/types';

const SEGMENTS: { key: ContactSegment | 'alle'; label: string }[] = [
  { key: 'geschaeft', label: 'Geschäft' },
  { key: 'privat', label: 'Privat' },
  { key: 'alle', label: 'Alle' },
];
const ROLES: { key: '' | 'kunde' | 'lieferant'; label: string }[] = [
  { key: '', label: 'Alle Rollen' },
  { key: 'kunde', label: 'Kunde' },
  { key: 'lieferant', label: 'Lieferant' },
];
const SEGMENT_LABEL: Record<string, string> = { geschaeft: 'Geschäft', privat: 'Privat' };

export function KontakteList(
  { rows, total, page, pageSize, search, role, segment }:
  { rows: ContactRow[]; total: number; page: number; pageSize: number;
    search: string; role: '' | 'kunde' | 'lieferant'; segment: ContactSegment | 'alle' },
) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(search);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Href mit übernommenen Parametern (Sortierung etc. bleibt erhalten); jede
  // Filter-/Suchänderung springt auf Seite 1 zurück.
  const hrefWith = (overrides: Record<string, string>, resetPage = true) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v) p.set(k, v); else p.delete(k);
    }
    if (resetPage) p.delete('page');
    const s = p.toString();
    return `${pathname}${s ? `?${s}` : ''}`;
  };
  const submitSearch = () => router.push(hrefWith({ q }));

  const chip = (active: boolean, label: string, href: string) => (
    <Link key={label} href={href}
      className={`rounded px-3 py-1 text-sm ${active
        ? 'bg-accent text-white'
        : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>{label}</Link>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }}
          placeholder="Name oder Nummer …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <button onClick={submitSearch}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200">Suchen</button>
        <span className="anno ml-1 text-neutral-400">Segment</span>
        {SEGMENTS.map((s) => chip(segment === s.key, s.label, hrefWith({ segment: s.key })))}
        <span className="anno ml-1 text-neutral-400">Rolle</span>
        {ROLES.map((r) => chip(role === r.key, r.label, hrefWith({ role: r.key })))}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500">
            <SortableTh col="name" label="Name" allowed={CONTACT_SORT.allowed} fallback={CONTACT_SORT.fallback} className="py-2" />
            <SortableTh col="segment" label="Segment" allowed={CONTACT_SORT.allowed} fallback={CONTACT_SORT.fallback} />
            <th className="anno py-2">Rolle</th>
            <SortableTh col="city" label="Ort" allowed={CONTACT_SORT.allowed} fallback={CONTACT_SORT.fallback} />
            <SortableTh col="status" label="Status" allowed={CONTACT_SORT.allowed} fallback={CONTACT_SORT.fallback} />
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/kontakte/${c.id}`} className="text-brand hover:text-brand-dark">{c.name}</Link>
              </td>
              <td className="text-neutral-500">{SEGMENT_LABEL[c.segment]}</td>
              <td>{[c.isCustomer && 'Kunde', c.isSupplier && 'Lieferant'].filter(Boolean).join(' + ') || '—'}</td>
              <td className="text-neutral-500">{c.city || '—'}</td>
              <td>{c.status}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Kontakte.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3 pt-1 text-sm text-neutral-500">
        {page > 1
          ? <Link href={hrefWith({ page: String(page - 1) }, false)} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">← Zurück</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">← Zurück</span>}
        <span>{total.toLocaleString('de-DE')} Kontakte · Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
        {page < totalPages
          ? <Link href={hrefWith({ page: String(page + 1) }, false)} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">Weiter →</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">Weiter →</span>}
      </div>
    </div>
  );
}
