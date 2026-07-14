import { notFound } from 'next/navigation';
import { getVariantStock, listWarehouses } from '@/verfuegbarkeit/repository';
import { BestandDetail } from '@/components/BestandDetail';

export const dynamic = 'force-dynamic';

export default async function VariantStockPage({ params }: { params: { variantId: string } }) {
  const detail = await getVariantStock(params.variantId);
  if (!detail) notFound();
  const warehouses = await listWarehouses();
  return <BestandDetail detail={detail} warehouses={warehouses} />;
}
