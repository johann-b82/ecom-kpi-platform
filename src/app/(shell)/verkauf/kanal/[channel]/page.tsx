import Link from 'next/link';
import { notFound } from 'next/navigation';
import { salesTotals, revenueByDay, topProducts } from '@/verkauf/repository';
import { resolveRange } from '@/lib/range';
import { Filters } from '@/components/Filters';
import { KanalSalesBoard } from '@/components/KanalSalesBoard';
import { CHANNEL_LABEL } from '@/verkauf/labels';
import type { OrderChannel } from '@/verkauf/types';

export const dynamic = 'force-dynamic';

const CHANNELS: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];

export default async function KanalPage(
  { params, searchParams }:
    { params: { channel: string }; searchParams: { days?: string; start?: string; end?: string } },
) {
  const channel = params.channel as OrderChannel;
  if (!CHANNELS.includes(channel)) notFound();

  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });

  const [totals, points, top] = await Promise.all([
    salesTotals(range, channel), revenueByDay(range, channel), topProducts(range, 10, channel),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/verkauf" className="anno text-neutral-500 hover:text-accent">← Übersicht</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · {CHANNEL_LABEL[channel]}</h2>
        <Filters range={range} basePath={`/verkauf/kanal/${channel}`} />
      </div>
      <KanalSalesBoard totals={totals} points={points} top={top} belegeHref={`/verkauf/belege?channel=${channel}`} />
    </div>
  );
}
