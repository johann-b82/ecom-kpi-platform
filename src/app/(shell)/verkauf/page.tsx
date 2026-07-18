import { salesTotals, channelSummary, statusFunnel, salesDailySeries } from '@/verkauf/repository';
import { resolveRange } from '@/lib/range';
import { pickBucket, bucketSum } from '@/lib/series';
import { Filters } from '@/components/Filters';
import { KanalVergleich } from '@/components/KanalVergleich';
import { StatusFunnel } from '@/components/StatusFunnel';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { eur } from '@/verkauf/format';

export const dynamic = 'force-dynamic';

export default async function VerkaufUebersichtPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const [totals, channels, funnel, daily] = await Promise.all([
    salesTotals(range), channelSummary(range), statusFunnel(range), salesDailySeries(range),
  ]);

  const bucket = pickBucket(range);
  const revenueSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.revenueNet })), bucket);
  const ordersSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.orders })), bucket);
  const ordersByDate = new Map(ordersSeries.map((p) => [p.date, p.value]));
  const avgSeries = revenueSeries.map((r) => {
    const o = ordersByDate.get(r.date) ?? 0;
    return { date: r.date, value: o > 0 ? r.value / o : 0 };
  });

  const items: KpiTrendItem[] = [
    { key: 'umsatz', label: 'Umsatz', value: eur(totals.revenueNet), anno: 'NETTO · OHNE MWST', series: revenueSeries, format: 'eur' },
    { key: 'sales', label: 'Sales', value: String(totals.orders), series: ordersSeries, format: 'num' },
    { key: 'avg', label: 'Ø Warenkorb', value: eur(totals.avgOrderValueNet), anno: 'NETTO · OHNE MWST', series: avgSeries, format: 'eur' },
    { key: 'angebote', label: 'Offene Angebote', value: String(totals.openOffers) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Übersicht</h2>
        <Filters range={range} basePath="/verkauf" />
      </div>
      <KpiTrendRow items={items} />
      <KanalVergleich channels={channels} />
      <StatusFunnel funnel={funnel} />
    </div>
  );
}
