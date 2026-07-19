import { customerMetrics } from '@/kontakte/analytics';
import { resolveRange } from '@/lib/range';
import { KundenAnalyse } from '@/components/KundenAnalyse';

export const dynamic = 'force-dynamic';

export default async function KundenAnalysePage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string; segment?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days ?? 'all', end, { start: searchParams.start, end: searchParams.end });
  const segment = searchParams.segment === 'geschaeft' || searchParams.segment === 'privat'
    ? searchParams.segment : null;
  const rows = await customerMetrics(range, { segment: segment ?? undefined });
  return <KundenAnalyse rows={rows} range={range} segment={segment} />;
}
