import { listStock } from '@/verfuegbarkeit/repository';
import { BestandListe } from '@/components/BestandListe';

export const dynamic = 'force-dynamic';

export default async function BestandPage() {
  const rows = await listStock();
  const belowCount = rows.filter((r) => r.belowReorder).length;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Bestand</h2>
      <BestandListe rows={rows} belowCount={belowCount} />
    </div>
  );
}
