import { notFound } from 'next/navigation';
import { getOrderView } from '@/verkauf/repository';
import { VerkaufDetail } from '@/components/VerkaufDetail';

export const dynamic = 'force-dynamic';

export default async function BelegPage({ params }: { params: { id: string } }) {
  const order = await getOrderView(params.id);
  if (!order) notFound();
  return <VerkaufDetail order={order} />;
}
