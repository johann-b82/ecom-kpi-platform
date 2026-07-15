import { listContactOptions, listPurchaseOrderOptions } from '@/finanzen/repository';
import { LieferantenrechnungForm } from '@/components/LieferantenrechnungForm';

export const dynamic = 'force-dynamic';

export default async function NeuePage() {
  const [contacts, purchaseOrders] = await Promise.all([listContactOptions(), listPurchaseOrderOptions()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Finanzen · Lieferantenrechnung</h2>
      <LieferantenrechnungForm contacts={contacts} purchaseOrders={purchaseOrders} />
    </div>
  );
}
