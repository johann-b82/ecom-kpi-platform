import { customerMetrics, customerKpis } from '@/kontakte/analytics';
import { resolveRange } from '@/lib/range';
import { KundenAnalyse } from '@/components/KundenAnalyse';

export const dynamic = 'force-dynamic';

const TABLE_LIMIT = 500;

export default async function KundenAnalysePage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string; segment?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days ?? 'all', end, { start: searchParams.start, end: searchParams.end });
  const segment = searchParams.segment === 'geschaeft' || searchParams.segment === 'privat'
    ? searchParams.segment : null;
  const [rows, kpis] = await Promise.all([
    customerMetrics(range, { segment: segment ?? undefined, limit: TABLE_LIMIT }),
    customerKpis(range, { segment: segment ?? undefined }),
  ]);
  return <KundenAnalyse rows={rows} kpis={kpis} limit={TABLE_LIMIT} range={range} segment={segment} />;
}
