import type { CanonicalDataset, Subscriber } from '@/lib/types';
import type { MailchimpActivityDay } from './types';

// Maps Mailchimp list-activity days onto canonical subscriber rows.
// signups ← subs (opt-in subscribes), unsubscribes ← unsubs. NPS is not
// available from Mailchimp (same as Klaviyo) → null.
export function normalizeActivity(activity: MailchimpActivityDay[]): CanonicalDataset {
  const byDate = new Map<string, Subscriber>();
  for (const d of activity) {
    const date = String(d.day ?? '').slice(0, 10);
    if (!date) continue;
    byDate.set(date, {
      date,
      source: 'mailchimp',
      signups: Number(d.subs ?? 0),
      unsubscribes: Number(d.unsubs ?? 0),
      npsScore: null,
    });
  }
  const subscribers = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers };
}
