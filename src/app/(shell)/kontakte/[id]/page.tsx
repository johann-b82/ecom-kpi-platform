import { notFound } from 'next/navigation';
import { getContact } from '@/kontakte/repository';
import { KontakteDetail } from '@/components/KontakteDetail';

export const dynamic = 'force-dynamic';

export default async function KontaktDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  if (!contact) notFound();
  return <KontakteDetail contact={contact} />;
}
