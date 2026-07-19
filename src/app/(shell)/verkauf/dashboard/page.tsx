import { loadDataset } from '@/kpi/repository';
import { computeKpis, previousRange } from '@/kpi/index';
import { resolveRange } from '@/lib/range';
import { ecomSalesFacts, marginTotals } from '@/verkauf/repository';
import { adPlatformEfficiency } from '@/verkauf/marketing';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';
import { MarketingMargin } from '@/components/MarketingMargin';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VerkaufDashboardPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const supabase = createClient();
  // Sales/Order-Zahlen (Umsatz, Käufe, Warenkorbwert, CLV) kommen aus den echten
  // WooCommerce-Belegen; Traffic-KPIs (Sessions/Checkouts) weiter aus GA4.
  const [dataset, factsCurrent, factsPrevious, marginCur, marginPrev] = await Promise.all([
    loadDataset(supabase),
    ecomSalesFacts(range),
    ecomSalesFacts(previousRange(range)),
    marginTotals(range),
    marginTotals(previousRange(range)),
  ]);
  const phases = computeKpis(dataset, range, { current: factsCurrent, previous: factsPrevious });
  const efficiency = adPlatformEfficiency(
    dataset.adSpend.filter((a) => a.date >= range.start && a.date <= range.end));

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · E-Commerce</h2>
        <Filters range={range} basePath="/verkauf/dashboard" />
      </header>
      <MarketingMargin current={marginCur} previous={marginPrev} efficiency={efficiency} />
      <div className="mt-6 flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </div>
  );
}
