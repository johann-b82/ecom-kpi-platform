import { listStockPaged } from '@/verfuegbarkeit/repository';
import { BestandListe } from '@/components/BestandListe';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;

export default async function BestandListePage(
  { searchParams }: { searchParams: { q?: string; filter?: string; sort?: string; page?: string } },
) {
  const search = searchParams.q?.trim() || '';
  const filter = searchParams.filter === 'below' ? 'below' : 'all';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { rows, total } = await listStockPaged({
    search, filter, sort: searchParams.sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Bestandsliste</h2>
      <BestandListe rows={rows} total={total} page={page} pageSize={PAGE_SIZE} search={search} filter={filter} />
    </div>
  );
}
