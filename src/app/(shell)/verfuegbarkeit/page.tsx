import { categoryRollup, dashboardKpis, stockTotalSeries, warenwertKpi, warenwertSeries } from '@/verfuegbarkeit/history';
import { resolveRange } from '@/lib/range';
import { pickBucket, bucketLast } from '@/lib/series';
import { Filters } from '@/components/Filters';
import { VerfuegbarkeitDashboard } from '@/components/VerfuegbarkeitDashboard';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitUebersichtPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const [kpis, rollup, stock, warenwert, warenwertPts] = await Promise.all([
    dashboardKpis(), categoryRollup(), stockTotalSeries(range), warenwertKpi(), warenwertSeries(range),
  ]);
  const bucket = pickBucket(range);
  const stockSeries = bucketLast(stock, bucket);
  const warenwertSeriesBucketed = bucketLast(warenwertPts, bucket);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Übersicht</h2>
        <Filters range={range} basePath="/verfuegbarkeit" />
      </div>
      <VerfuegbarkeitDashboard
        kpis={kpis} rollup={rollup} stockSeries={stockSeries}
        warenwert={warenwert.warenwert} ekUnvollstaendig={warenwert.ekUnvollstaendig}
        warenwertSeries={warenwertSeriesBucketed}
      />
    </div>
  );
}
