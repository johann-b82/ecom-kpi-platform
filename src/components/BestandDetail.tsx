'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { VariantStockDetail, WarehouseOption, AdjustmentReason, SeriesPoint } from '@/verfuegbarkeit/types';
import { REASON_LABEL } from '@/verfuegbarkeit/labels';
import { formatDeDate } from '@/lib/dates';
import { adjustStockAction } from '@/app/(shell)/verfuegbarkeit/actions';
import { StockSalesChart } from '@/components/StockSalesChart';
import { ForecastTile } from '@/components/ForecastTile';
import type { Forecast } from '@/verfuegbarkeit/forecast';

const REASONS: AdjustmentReason[] = ['inventurdifferenz', 'bruch_schwund', 'korrektur_fehlbuchung'];

export function BestandDetail({ detail, warehouses, stock, sales, forecast }: {
  detail: VariantStockDetail; warehouses: WarehouseOption[];
  stock: SeriesPoint[]; sales: SeriesPoint[]; forecast: Forecast | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('inventurdifferenz');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const d = parseInt(delta, 10);
    if (!warehouseId || Number.isNaN(d) || d === 0) { setError('Lager und eine Menge ≠ 0 angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        await adjustStockAction(detail.variantId, warehouseId, d, reason, note || undefined);
        setDelta(''); setNote(''); router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verfuegbarkeit/liste" className="text-brand hover:text-brand-dark">← Bestandsliste</Link>
        <h2 className="text-xl font-bold tracking-tight">{detail.sku}</h2>
        <span className="text-neutral-500">{detail.productName}</span>
        <span className="anno ml-auto text-neutral-500">Meldebestand {detail.reorderPoint > 0 ? detail.reorderPoint : '—'}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><StockSalesChart stock={stock} sales={sales} /></div>
        <ForecastTile forecast={forecast} />
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Bestand je Lager</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="anno text-left text-neutral-500">
              <th className="py-1">Lager</th><th className="text-right">Bestand</th><th className="text-right">Reserviert</th>
            </tr></thead>
            <tbody>
              {detail.perWarehouse.map((w) => (
                <tr key={w.warehouseId} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1">{w.warehouseName}</td>
                  <td className="text-right">{w.onHand}</td>
                  <td className="text-right text-neutral-500">{w.reserved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Bestand korrigieren</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±Menge" className={`${input} w-24`} />
          <select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} className={input}>
            {REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz (optional)" className={`${input} flex-1`} />
          <button onClick={submit} disabled={pending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Buchen</button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Korrektur-Historie</p>
        {detail.adjustments.length === 0
          ? <p className="text-sm text-neutral-500">Keine Korrekturen.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <tbody>
                  {detail.adjustments.map((a) => (
                    <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                      <td className="py-1 text-neutral-500">{formatDeDate(a.createdAt)}</td>
                      <td className={a.delta < 0 ? 'text-danger' : ''}>{a.delta > 0 ? `+${a.delta}` : a.delta}</td>
                      <td>{REASON_LABEL[a.reason]}</td>
                      <td className="text-neutral-500">{a.note ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
