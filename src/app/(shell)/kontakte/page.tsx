import { listContactsPaged } from '@/kontakte/repository';
import { KontakteList } from '@/components/KontakteList';
import type { ContactSegment } from '@/kontakte/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function KontaktePage(
  { searchParams }: { searchParams: { q?: string; role?: string; segment?: string; sort?: string; page?: string } },
) {
  const search = searchParams.q?.trim() || '';
  const role = searchParams.role === 'kunde' || searchParams.role === 'lieferant' ? searchParams.role : undefined;
  const segment = (['geschaeft', 'privat', 'alle'].includes(searchParams.segment ?? '')
    ? searchParams.segment : 'geschaeft') as ContactSegment | 'alle';
  const page = Math.max(1, Number(searchParams.page) || 1);

  const { rows, total } = await listContactsPaged({
    search, role, segment, sort: searchParams.sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Kontakte</h2>
      <KontakteList
        rows={rows} total={total} page={page} pageSize={PAGE_SIZE}
        search={search} role={role ?? ''} segment={segment}
      />
    </div>
  );
}
