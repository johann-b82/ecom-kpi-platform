'use client';
import { BarChart, DonutChart, Card } from '@tremor/react';
import type { NamedValue } from '@/brickpm/analytics';

const cardCls = 'bg-white dark:bg-neutral-900';
const label = 'text-sm font-medium text-neutral-700 dark:text-neutral-300';

export function BpmAnalyticsCharts({
  revenue, marge, sell, status,
}: { revenue: NamedValue[]; marge: NamedValue[]; sell: NamedValue[]; status: NamedValue[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className={cardCls}>
        <p className={label}>Aktions-Zielumsatz nach Kategorie</p>
        <BarChart className="mt-3 h-64" data={revenue} index="name" categories={['value']} colors={['blue']}
          valueFormatter={(n) => `${n.toLocaleString('de-DE')} €`} showLegend={false} yAxisWidth={72} />
      </Card>
      <Card className={cardCls}>
        <p className={label}>Ø Marge nach Serie</p>
        <BarChart className="mt-3 h-64" data={marge} index="name" categories={['value']} colors={['emerald']}
          valueFormatter={(n) => `${n} %`} showLegend={false} yAxisWidth={56} />
      </Card>
      <Card className={cardCls}>
        <p className={label}>Sell-through je Aktion</p>
        <BarChart className="mt-3 h-64" data={sell} index="name" categories={['value']} colors={['amber']}
          valueFormatter={(n) => `${n} %`} showLegend={false} yAxisWidth={56} />
      </Card>
      <Card className={cardCls}>
        <p className={label}>Produkt-Status</p>
        <DonutChart className="mt-3 h-64" data={status} category="value" index="name" valueFormatter={(n) => `${n}`} />
      </Card>
    </div>
  );
}
