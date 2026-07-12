import { listContacts } from '@/kontakte/repository';
import { KontakteList } from '@/components/KontakteList';

export const dynamic = 'force-dynamic';

export default async function KontaktePage() {
  const contacts = await listContacts();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Kontakte</h2>
      <KontakteList contacts={contacts} />
    </div>
  );
}
