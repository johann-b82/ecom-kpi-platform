import Link from 'next/link';
import type { ChannelSummary, OrderChannel } from '@/verkauf/types';
import { CHANNEL_LABEL } from '@/verkauf/labels';
import { eur } from '@/verkauf/format';

const ORDER: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];

export function KanalVergleich({ channels }: { channels: ChannelSummary[] }) {
  const by = new Map(channels.map((c) => [c.channel, c]));
  return (
    <div>
      <p className="anno mb-3 text-neutral-500">Kanal-Vergleich · netto, ohne MwSt</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ORDER.map((ch) => {
          const c = by.get(ch);
          return (
            <Link key={ch} href={`/verkauf/belege?channel=${ch}`}
              className="rounded-lg border border-neutral-200 bg-white p-4 transition hover:border-accent dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{CHANNEL_LABEL[ch]}</p>
              <p className="mt-2 text-xl font-semibold text-neutral-900 dark:text-neutral-100">{eur(c?.revenueNet ?? 0)}</p>
              <p className="mt-1 text-sm text-neutral-500">{c?.orders ?? 0} Belege · Ø {eur(c?.avgOrderValueNet ?? 0)}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
