'use client';
import type { ChannelSummary } from '@/verkauf/types';
import { CHANNEL_LABEL } from '@/verkauf/labels';
import { eur } from '@/verkauf/format';
import { useClientSort, ClientSortableTh } from './useClientSort';

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')} %`);

export function KanalVergleich({ channels }: { channels: ChannelSummary[] }) {
  // Default: schwächster DB% oben — die eigentliche Botschaft der Tabelle.
  const { sorted: rows, sort, onSort } = useClientSort(channels, {
    channel: (c) => CHANNEL_LABEL[c.channel],
    revenueNet: (c) => c.revenueNet,
    wareneinsatz: (c) => c.wareneinsatz,
    gebuehren: (c) => c.gebuehren,
    werbung: (c) => c.werbung,
    db: (c) => c.db,
    dbProzent: (c) => c.dbProzent,
  }, { col: 'dbProzent', dir: 'asc' });

  return (
    <div>
      <p className="anno mb-3 text-neutral-500">Kanal-Vergleich · netto, ohne MwSt · Werbung als eigene Spalte</p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <ClientSortableTh col="channel" label="Kanal" sort={sort} onSort={onSort} className="px-3 py-2" />
              <ClientSortableTh col="revenueNet" label="Umsatz" sort={sort} onSort={onSort} className="px-3 text-right" />
              <ClientSortableTh col="wareneinsatz" label="Wareneinsatz" sort={sort} onSort={onSort} className="px-3 text-right" />
              <ClientSortableTh col="gebuehren" label="Gebühren" sort={sort} onSort={onSort} className="px-3 text-right" />
              <ClientSortableTh col="werbung" label="Werbung" sort={sort} onSort={onSort} className="px-3 text-right" />
              <ClientSortableTh col="db" label="DB" sort={sort} onSort={onSort} className="px-3 text-right" />
              <ClientSortableTh col="dbProzent" label="DB %" sort={sort} onSort={onSort} className="px-3 text-right" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.channel} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2 font-medium text-neutral-900 dark:text-neutral-100">{CHANNEL_LABEL[c.channel]}</td>
                <td className="px-3 text-right tabular-nums">{eur(c.revenueNet)}</td>
                <td className="px-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{eur(c.wareneinsatz)}</td>
                <td className="px-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{eur(c.gebuehren)}</td>
                <td className="px-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{eur(c.werbung)}</td>
                <td className="px-3 text-right tabular-nums font-semibold">{eur(c.db)}</td>
                <td className="px-3 text-right tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <span className="hidden h-1.5 w-10 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 sm:inline-block">
                      <span className="block h-full bg-accent"
                        style={{ width: `${Math.max(0, Math.min(1, c.dbProzent ?? 0)) * 100}%` }} />
                    </span>
                    {pct(c.dbProzent)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
