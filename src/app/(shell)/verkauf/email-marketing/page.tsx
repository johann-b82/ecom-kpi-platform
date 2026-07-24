import { createClient } from '@/lib/supabase/server';
import { loadDataset } from '@/kpi/repository';
import { aggregateSubscribers } from '@/verkauf/email-marketing';
import { resolveRange } from '@/lib/range';
import { Filters } from '@/components/Filters';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { EmailMarketingChart } from '@/components/EmailMarketingChart';
import { num } from '@/components/charts/chart-style';

export const dynamic = 'force-dynamic';

export default async function EmailMarketingPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });

  const supabase = createClient();
  const data = await loadDataset(supabase);
  const { totals, series } = aggregateSubscribers(data.subscribers, range);

  const nettoStr = `${totals.netto >= 0 ? '+' : '−'}${num(Math.abs(totals.netto))}`;
  const items: KpiTrendItem[] = [
    { key: 'signups', label: 'Anmeldungen', value: num(totals.signups) },
    { key: 'unsubscribes', label: 'Abmeldungen', value: num(totals.unsubscribes) },
    { key: 'netto', label: 'Netto', value: nettoStr, anno: 'ANMELDUNGEN − ABMELDUNGEN' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Email-Marketing</h2>
        <Filters range={range} basePath="/verkauf/email-marketing" />
      </div>
      <KpiTrendRow items={items} gridClassName="grid gap-3 sm:grid-cols-3" />
      <EmailMarketingChart series={series} />
    </div>
  );
}
