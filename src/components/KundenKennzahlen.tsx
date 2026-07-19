import Link from 'next/link';
import { eur } from '@/verkauf/format';
import { formatDeDate } from '@/lib/dates';
import { STATUS_LABEL, CHANNEL_LABEL } from '@/verkauf/labels';
import type { CustomerSummary, CustomerOrderRow } from '@/kontakte/analytics';

export function KundenKennzahlen({ summary, orders }:
  { summary: CustomerSummary; orders: CustomerOrderRow[] }) {
  const tiles: { label: string; value: string }[] = [
    { label: 'Umsatz gesamt', value: eur(summary.revenueNet) },
    { label: 'Bestellungen', value: String(summary.orders) },
    { label: 'Ø Warenkorb', value: eur(summary.avgOrderValueNet) },
    { label: 'CLV', value: eur(summary.clv) },
    { label: 'Erste Bestellung', value: summary.firstOrderAt ? formatDeDate(summary.firstOrderAt) : '—' },
    { label: 'Letzte Bestellung', value: summary.lastOrderAt ? formatDeDate(summary.lastOrderAt) : '—' },
  ];
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="anno text-neutral-500">Geschäftskennzahlen</p>
        {summary.isReturning && <span className="rounded bg-accent/15 px-2 py-0.5 text-xs text-accent">Wiederkäufer</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-neutral-200 bg-neutral-0 p-3 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="anno text-neutral-500">{t.label}</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{t.value}</p>
          </div>
        ))}
      </div>
      {orders.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-neutral-500">
              <th className="anno px-3 py-2">Beleg</th><th className="anno px-3 py-2">Datum</th>
              <th className="anno px-3 py-2">Kanal</th><th className="anno px-3 py-2">Status</th>
              <th className="anno px-3 py-2 text-right">Betrag</th>
            </tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="px-3 py-1.5">
                    <Link href={`/verkauf/belege/${o.id}`} className="text-brand hover:text-brand-dark">{o.number}</Link>
                  </td>
                  <td className="px-3 py-1.5 text-neutral-500">{formatDeDate(o.placedAt)}</td>
                  <td className="px-3 py-1.5">{CHANNEL_LABEL[o.channel]}</td>
                  <td className="px-3 py-1.5">{STATUS_LABEL[o.status]}</td>
                  <td className="px-3 py-1.5 text-right">{eur(o.revenueNet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
