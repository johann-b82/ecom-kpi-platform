import { listOrderRows } from '@/verkauf/repository';
import { VerkaufList } from '@/components/VerkaufList';
import type { OrderChannel } from '@/verkauf/types';

export const dynamic = 'force-dynamic';

const CHANNELS: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];

export default async function BelegePage({ searchParams }: { searchParams: { channel?: string } }) {
  const channel = CHANNELS.includes(searchParams.channel as OrderChannel)
    ? (searchParams.channel as OrderChannel) : undefined;
  const rows = await listOrderRows(channel);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verkauf · Belege</h2>
      <VerkaufList rows={rows} initialChannel={channel ?? ''} />
    </div>
  );
}
