import { listPurchaseOrders } from '@/verfuegbarkeit/repository';
import { WareneingangListe } from '@/components/WareneingangListe';

export const dynamic = 'force-dynamic';

export default async function WareneingangPage() {
  const rows = await listPurchaseOrders();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Wareneingang</h2>
      <WareneingangListe rows={rows} />
    </div>
  );
}
