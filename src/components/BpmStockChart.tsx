'use client';
import { BarChart, Card } from '@tremor/react';

export function BpmStockChart({ data }: { data: { name: string; Bestand: number; Mindestbestand: number }[] }) {
  return (
    <Card className="bg-white dark:bg-neutral-900">
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Bestand vs. Mindestbestand</p>
      <BarChart className="mt-3 h-72" data={data} index="name" categories={['Bestand', 'Mindestbestand']}
        colors={['blue', 'red']} valueFormatter={(n) => `${n}`} yAxisWidth={48} />
    </Card>
  );
}
