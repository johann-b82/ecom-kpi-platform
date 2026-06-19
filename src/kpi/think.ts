import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, metricPresent, ratio, kpi } from './helpers';

export function thinkKpis(data: CanonicalDataset, range: DateRange): Kpi[] {
  const dm = data.dailyMetrics;
  const sessions = metricSum(dm, 'sessions', range);
  const subs = data.subscribers.filter((s) => inRange(s.date, range));
  const signups = subs.reduce((s, r) => s + r.signups, 0);

  return [
    kpi('sessions', 'Sessions', 'think',
      metricPresent(dm, 'sessions', range) ? sessions : null, 'number'),
    kpi('pages_per_session', 'Seiten / Sitzung', 'think',
      ratio(metricSum(dm, 'pageviews', range), sessions), 'number'),
    kpi('bounce_rate', 'Bounce Rate', 'think',
      ratio(metricSum(dm, 'bounced_sessions', range), sessions), 'percent'),
    kpi('returning_visitors', 'Wiederkehrende Besucher', 'think',
      ratio(metricSum(dm, 'returning_users', range), metricSum(dm, 'total_users', range)), 'percent'),
    kpi('atc_rate', 'Add-to-Cart-Rate', 'think',
      ratio(metricSum(dm, 'add_to_carts', range), sessions), 'percent'),
    kpi('newsletter_signups', 'Newsletter-Anmeldungen', 'think',
      subs.length > 0 ? signups : null, 'number'),
  ];
}
