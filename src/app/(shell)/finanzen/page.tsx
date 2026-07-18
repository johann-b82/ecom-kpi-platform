import { listOpenItems } from '@/finanzen/repository';
import { resolveRange } from '@/lib/range';
import { OffenePostenListe } from '@/components/OffenePostenListe';

export const dynamic = 'force-dynamic';

export default async function OffenePostenPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  // Offene Posten sind Salden, keine Reporting-Periode: ohne Wahl alle zeigen,
  // damit die Kopf-Kennzahlen den vollen offenen Betrag ausweisen.
  const { range } = resolveRange(searchParams.days ?? 'all', end, { start: searchParams.start, end: searchParams.end });
  const items = await listOpenItems({ dueFrom: range.start, dueTo: range.end });
  const sum = (dir: 'debitor' | 'kreditor') =>
    items.filter((i) => i.direction === dir && i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
  const overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  return (
    <OffenePostenListe items={items} debitorOpen={sum('debitor')} kreditorOpen={sum('kreditor')}
      overdue={overdue} range={range} />
  );
}
