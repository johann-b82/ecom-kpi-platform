import { listProducts } from '@/brickpm/repository';
import { BpmSortiment } from '@/components/BpmSortiment';

export const dynamic = 'force-dynamic';

export default async function SortimentPage() {
  const products = await listProducts();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Sortiment</h2>
      <BpmSortiment products={products} />
    </div>
  );
}
