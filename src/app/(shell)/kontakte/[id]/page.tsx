import { notFound } from 'next/navigation';
import { getContact } from '@/kontakte/repository';
import { customerSummary, customerOrders } from '@/kontakte/analytics';
import { KontakteDetail } from '@/components/KontakteDetail';
import { KundenKennzahlen } from '@/components/KundenKennzahlen';

export const dynamic = 'force-dynamic';

export default async function KontaktDetailPage({ params }: { params: { id: string } }) {
  const contact = await getContact(params.id);
  if (!contact) notFound();
  const analytics = contact.isCustomer
    ? await Promise.all([customerSummary(params.id), customerOrders(params.id)])
    : null;
  return (
    <div className="space-y-6">
      {analytics && <KundenKennzahlen summary={analytics[0]} orders={analytics[1]} />}
      <KontakteDetail contact={contact} />
    </div>
  );
}
