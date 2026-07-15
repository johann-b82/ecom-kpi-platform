import { notFound } from 'next/navigation';
import { getOpenItem } from '@/finanzen/repository';
import { OffenePostenDetail } from '@/components/OffenePostenDetail';

export const dynamic = 'force-dynamic';

export default async function OpenItemPage({ params }: { params: { id: string } }) {
  const item = await getOpenItem(params.id);
  if (!item) notFound();
  return <OffenePostenDetail item={item} />;
}
