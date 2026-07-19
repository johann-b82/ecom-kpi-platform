import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard';
import { eur } from '@/verkauf/format';
import { pct } from '@/components/charts/chart-style';
import type { SalesTotals, RevenuePoint, TopProduct } from '@/verkauf/types';

function StatTile({ label, value, anno }: { label: string; value: string; anno?: string }) {
  return (
    <ChartCard>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {anno && <p className="anno mt-1 text-neutral-500">{anno}</p>}
    </ChartCard>
  );
}

function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.revenueNet));
  return (
    <ChartCard title="Umsatzverlauf · netto">
      <div className="flex h-44 items-end gap-px">
        {points.map((p) => (
          <div key={p.day} title={`${p.day}: ${eur(p.revenueNet)}`}
            className="flex-1 rounded-t bg-accent hover:bg-accent-hover"
            style={{ height: `${Math.max(2, (p.revenueNet / max) * 100)}%` }} />
        ))}
        {points.length === 0 && <p className="w-full text-center text-sm text-neutral-500">Keine Umsätze im Zeitraum.</p>}
      </div>
      {points.length > 0 && (
        <div className="anno mt-2 flex justify-between text-neutral-500">
          <span>{points[0].day}</span><span>{points[points.length - 1].day}</span>
        </div>
      )}
    </ChartCard>
  );
}

function TopProducts({ items }: { items: TopProduct[] }) {
  return (
    <ChartCard title="Top-Produkte · nach Umsatz">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-1">Produkt</th><th>SKU</th><th className="text-right">Stück</th><th className="text-right">Umsatz</th>
          </tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.sku} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1.5">{p.name}</td>
                <td className="font-mono text-xs text-neutral-500">{p.sku}</td>
                <td className="text-right tabular-nums">{p.units}</td>
                <td className="text-right tabular-nums">{eur(p.revenueNet)}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-neutral-500">Keine Daten.</td></tr>}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// Sales view for a single channel (Ebene 2). Drills down into Belege (Ebene 3).
export function KanalSalesBoard(
  { totals, points, top, belegeHref }:
  { totals: SalesTotals; points: RevenuePoint[]; top: TopProduct[]; belegeHref: string },
) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Umsatz" value={eur(totals.revenueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Belege" value={String(totals.orders)} />
        <StatTile label="Ø Warenkorb" value={eur(totals.avgOrderValueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Stornoquote" value={pct(totals.stornoQuote * 100)}
          anno={`${eur(totals.cancelledRevenue)} STORNIERT`} />
      </div>
      <RevenueChart points={points} />
      <TopProducts items={top} />
      <div>
        <Link href={belegeHref}
          className="inline-block rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover">
          Belege ansehen →
        </Link>
      </div>
    </div>
  );
}
