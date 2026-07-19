import { listOpenItems, cashflowInByDay } from '@/finanzen/repository';
import { resolveRange } from '@/lib/range';
import { bucketSum } from '@/lib/series';
import { OffenePostenListe } from '@/components/OffenePostenListe';
import { ChartCard } from '@/components/charts/ChartCard';
import { KpiLineChart } from '@/components/charts/KpiLineChart';

export const dynamic = 'force-dynamic';

export default async function OffenePostenPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  // Offene Posten sind Salden, keine Reporting-Periode: ohne Wahl alle zeigen,
  // damit die Kopf-Kennzahlen den vollen offenen Betrag ausweisen.
  const { range } = resolveRange(searchParams.days ?? 'all', end, { start: searchParams.start, end: searchParams.end });

  // Cashflow-Chart: fixe letzte 12 Monate, monatlich gebucketet — unabhängig
  // vom Salden-Zeitraum der Offene-Posten-Liste.
  const d = new Date(end);
  const cashflowStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  const [items, cashRaw] = await Promise.all([
    listOpenItems({ dueFrom: range.start, dueTo: range.end }),
    cashflowInByDay({ start: cashflowStart, end }),
  ]);
  const cashflowSeries = bucketSum(cashRaw.map((c) => ({ date: c.day, value: c.amount })), 'month');

  const sum = (dir: 'debitor' | 'kreditor') =>
    items.filter((i) => i.direction === dir && i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
  const overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  return (
    <div className="space-y-6">
      <ChartCard title="Operativer Cashflow · Einzahlungen">
        <KpiLineChart title="Einzahlungen (letzte 12 Monate)" series={cashflowSeries} format="eur" />
      </ChartCard>
      <OffenePostenListe items={items} debitorOpen={sum('debitor')} kreditorOpen={sum('kreditor')}
        overdue={overdue} range={range} />
    </div>
  );
}
