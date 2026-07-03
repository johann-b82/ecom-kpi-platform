import { listProducts, listPriceHistory } from '@/brickpm/repository';
import { BpmPriceHistory } from '@/components/BpmPriceHistory';

export const dynamic = 'force-dynamic';

export default async function PreisHistoriePage() {
  const [products, history] = await Promise.all([listProducts(), listPriceHistory()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Preis- &amp; Margen-Historie</h2>
      <BpmPriceHistory products={products} history={history} />
    </div>
  );
}
