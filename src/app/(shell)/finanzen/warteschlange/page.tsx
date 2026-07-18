import { listUnassignedPayments, listOpenItemOptions } from '@/finanzen/repository';
import { Warteschlange } from '@/components/Warteschlange';

export const dynamic = 'force-dynamic';

export default async function WarteschlangePage() {
  const [payments, options] = await Promise.all([listUnassignedPayments(), listOpenItemOptions()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Finanzen · Warteschlange</h2>
      <Warteschlange payments={payments} options={options} />
    </div>
  );
}
