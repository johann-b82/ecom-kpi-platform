import { notFound } from 'next/navigation';
import { getPurchaseOrder } from '@/verfuegbarkeit/repository';
import { WareneingangDetail } from '@/components/WareneingangDetail';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const po = await getPurchaseOrder(params.id);
  if (!po) notFound();
  return <WareneingangDetail po={po} />;
}
