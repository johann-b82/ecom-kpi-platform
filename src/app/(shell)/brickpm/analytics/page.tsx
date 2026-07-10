import { listProducts, listPromotions } from '@/brickpm/repository';
import { revenueByCategory, margeBySeries, sellThrough, statusDistribution } from '@/brickpm/analytics';
import { BpmAnalyticsCharts } from '@/components/BpmAnalyticsCharts';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const [products, promotions] = await Promise.all([listProducts(), listPromotions()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Analytics &amp; Reporting</h2>
      <BpmAnalyticsCharts
        revenue={revenueByCategory(products, promotions)}
        marge={margeBySeries(products)}
        sell={sellThrough(promotions)}
        status={statusDistribution(products)}
      />
    </div>
  );
}
