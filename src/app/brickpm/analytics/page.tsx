import { BarChart, DonutChart, Card } from '@tremor/react';
import { listProducts, listPromotions } from '@/brickpm/repository';
import { revenueByCategory, margeBySeries, sellThrough, statusDistribution } from '@/brickpm/analytics';

export const dynamic = 'force-dynamic';

const cardCls = 'bg-white dark:bg-neutral-900';

export default async function AnalyticsPage() {
  const [products, promotions] = await Promise.all([listProducts(), listPromotions()]);
  const revenue = revenueByCategory(products, promotions);
  const marge = margeBySeries(products);
  const sell = sellThrough(promotions);
  const status = statusDistribution(products);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Analytics &amp; Reporting</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className={cardCls}>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Aktions-Zielumsatz nach Kategorie</p>
          <BarChart className="mt-3 h-64" data={revenue} index="name" categories={['value']} colors={['blue']}
            valueFormatter={(n) => `${n.toLocaleString('de-DE')} €`} showLegend={false} yAxisWidth={72} />
        </Card>
        <Card className={cardCls}>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Ø Marge nach Serie</p>
          <BarChart className="mt-3 h-64" data={marge} index="name" categories={['value']} colors={['emerald']}
            valueFormatter={(n) => `${n} %`} showLegend={false} yAxisWidth={56} />
        </Card>
        <Card className={cardCls}>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Sell-through je Aktion</p>
          <BarChart className="mt-3 h-64" data={sell} index="name" categories={['value']} colors={['amber']}
            valueFormatter={(n) => `${n} %`} showLegend={false} yAxisWidth={56} />
        </Card>
        <Card className={cardCls}>
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Produkt-Status</p>
          <DonutChart className="mt-3 h-64" data={status} category="value" index="name"
            valueFormatter={(n) => `${n}`} />
        </Card>
      </div>
    </div>
  );
}
