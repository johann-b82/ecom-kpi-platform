import { listOrderRowsPaged } from '@/verkauf/repository';
import { VerkaufList } from '@/components/VerkaufList';
import type { OrderChannel } from '@/verkauf/types';

export const dynamic = 'force-dynamic';

const CHANNELS: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];
const PAGE_SIZE = 50;

export default async function BelegePage({ searchParams }: { searchParams: { channel?: string; q?: string; sort?: string; page?: string } }) {
  const channel = CHANNELS.includes(searchParams.channel as OrderChannel)
    ? (searchParams.channel as OrderChannel) : undefined;
  const search = searchParams.q?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  const { rows, total } = await listOrderRowsPaged({
    channel, search, sort: searchParams.sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verkauf · Sales</h2>
      <VerkaufList
        rows={rows} total={total} page={page} pageSize={PAGE_SIZE}
        channel={channel ?? ''} search={search ?? ''}
      />
    </div>
  );
}
