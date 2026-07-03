import { listProducts } from '@/brickpm/repository';
import { BpmMargeCalc } from '@/components/BpmMargeCalc';

export const dynamic = 'force-dynamic';

export default async function MargePage() {
  const products = await listProducts();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Marge &amp; Sales-Ziele</h2>
      <BpmMargeCalc products={products} />
    </div>
  );
}
