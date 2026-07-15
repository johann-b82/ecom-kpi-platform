import { listOpenItems } from '@/finanzen/repository';
import { OffenePostenListe } from '@/components/OffenePostenListe';

export const dynamic = 'force-dynamic';

export default async function OffenePostenPage() {
  const items = await listOpenItems();
  const sum = (dir: 'debitor' | 'kreditor') =>
    items.filter((i) => i.direction === dir && i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
  const overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  return (
    <OffenePostenListe items={items} debitorOpen={sum('debitor')} kreditorOpen={sum('kreditor')} overdue={overdue} />
  );
}
