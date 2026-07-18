import { listCustomerOptions, sellableVariants, defaultPrices } from '@/verkauf/repository';
import { NeuerBeleg } from '@/components/NeuerBeleg';

export const dynamic = 'force-dynamic';

export default async function NeuerBelegPage() {
  const [customers, variants, prices] = await Promise.all([
    listCustomerOptions(), sellableVariants(), defaultPrices(),
  ]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Neuer Beleg</h2>
      <NeuerBeleg customers={customers} variants={variants} prices={prices} />
    </div>
  );
}
