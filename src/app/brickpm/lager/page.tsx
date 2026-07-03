import { BarChart, Card } from '@tremor/react';
import { listProducts } from '@/brickpm/repository';
import { reorderList } from '@/brickpm/analytics';

export const dynamic = 'force-dynamic';

const th = 'px-3 py-2 text-left font-semibold text-neutral-500';
const td = 'px-3 py-2 text-neutral-800 dark:text-neutral-200';

export default async function LagerPage() {
  const products = await listProducts();
  const reorder = reorderList(products);
  const chart = products.map((p) => ({ name: p.id, Bestand: p.stock, Mindestbestand: p.minStock }));

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Lager &amp; Nachbestellung</h2>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">Nachbestellung nötig ({reorder.length})</h3>
        <div className="overflow-x-auto rounded-lg border border-neutral-200 dark:border-neutral-800">
          <table className="w-full border-collapse text-sm tabular-nums">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase tracking-wider dark:border-neutral-800 dark:bg-neutral-950">
              <tr><th className={th}>ID</th><th className={th}>Name</th><th className={th}>Bestand</th><th className={th}>Mindestbestand</th><th className={th}>Nachbestell-Vorschlag</th></tr>
            </thead>
            <tbody>
              {reorder.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 dark:border-neutral-800/60">
                  <td className={`${td} font-mono text-xs`}>{r.id}</td>
                  <td className={td}>{r.name}</td>
                  <td className={`${td} font-semibold text-red-600 dark:text-red-400`}>{r.stock}</td>
                  <td className={td}>{r.minStock}</td>
                  <td className={`${td} font-semibold text-brand`}>{r.reorder}</td>
                </tr>
              ))}
              {reorder.length === 0 && <tr><td className={`${td} text-neutral-500`} colSpan={5}>Alle Bestände über Mindestbestand.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Card className="bg-white dark:bg-neutral-900">
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Bestand vs. Mindestbestand</p>
        <BarChart className="mt-3 h-72" data={chart} index="name" categories={['Bestand', 'Mindestbestand']}
          colors={['blue', 'red']} valueFormatter={(n) => `${n}`} yAxisWidth={48} />
      </Card>
    </div>
  );
}
