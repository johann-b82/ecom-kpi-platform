import { listProducts } from '@/katalog/repository';
import { KatalogList } from '@/components/KatalogList';

export const dynamic = 'force-dynamic';

export default async function KatalogPage() {
  const products = await listProducts();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Katalog</h2>
      <KatalogList products={products} />
    </div>
  );
}
