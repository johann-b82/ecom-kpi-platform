import { listReorderSuggestions, listSuppliers } from '@/verfuegbarkeit/repository';
import { MeldebestandListe } from '@/components/MeldebestandListe';

export const dynamic = 'force-dynamic';

export default async function MeldebestandPage() {
  const [suggestions, suppliers] = await Promise.all([listReorderSuggestions(), listSuppliers()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Meldebestand</h2>
      <MeldebestandListe suggestions={suggestions} suppliers={suppliers} />
    </div>
  );
}
