'use client';
import Link from 'next/link';
import type { PurchaseOrderRow } from '@/verfuegbarkeit/types';
import { PO_STATUS_LABEL } from '@/verfuegbarkeit/labels';

export function WareneingangListe({ rows }: { rows: PurchaseOrderRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Nummer</th><th>Lieferant</th><th>Status</th>
          <th className="text-right">Eingang</th><th>Erwartet</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/verfuegbarkeit/wareneingang/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link>
              </td>
              <td>{r.supplierName}</td>
              <td><span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{PO_STATUS_LABEL[r.status]}</span></td>
              <td className="text-right text-neutral-500">{r.received}/{r.ordered}</td>
              <td className="text-neutral-500">{r.expectedAt ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Bestellungen.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
