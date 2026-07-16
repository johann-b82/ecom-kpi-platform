import { loadDataset } from '@/kpi/repository';
import { computeKpis, previousRange } from '@/kpi/index';
import { resolveRange } from '@/lib/range';
import { ecomSalesFacts } from '@/verkauf/repository';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VerkaufDashboardPage({ searchParams }: { searchParams: { days?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end);
  const supabase = createClient();
  // Sales/Order-Zahlen (Umsatz, Käufe, Warenkorbwert, CLV) kommen aus den echten
  // WooCommerce-Belegen; Traffic-KPIs (Sessions/Checkouts) weiter aus GA4.
  const [dataset, factsCurrent, factsPrevious] = await Promise.all([
    loadDataset(supabase),
    ecomSalesFacts(range),
    ecomSalesFacts(previousRange(range)),
  ]);
  const phases = computeKpis(dataset, range, { current: factsCurrent, previous: factsPrevious });

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · E-Commerce</h2>
        <Filters range={range} basePath="/verkauf/dashboard" />
      </header>
      <div className="flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </div>
  );
}
