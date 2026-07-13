import { listOrderRows } from '@/verkauf/repository';
import { VerkaufList } from '@/components/VerkaufList';

export const dynamic = 'force-dynamic';

export default async function VerkaufPage() {
  const rows = await listOrderRows();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verkauf</h2>
      <VerkaufList rows={rows} />
    </div>
  );
}
