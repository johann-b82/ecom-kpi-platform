import type {
  AdPlatform, CanonicalDataset, Customer, DailyMetric, DateRange, Order, Subscriber,
} from '@/lib/types';
import { addDays, daysBetween } from '@/lib/dates';

// Deterministischer PRNG (mulberry32) — stabile Seed-Daten für Tests.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const PLATFORMS: AdPlatform[] = ['google_ads', 'meta_ads', 'tiktok_ads'];

// Verteilt eine Tagessumme deterministisch auf Kampagnen. Die letzte Kampagne
// absorbiert den Rundungsrest, sodass die Summe für gerundete/ganzzahlige Metriken
// (round=true) EXAKT erhalten bleibt. Für convValue (round=false) gilt das nur bis
// auf IEEE-754-Darstellungsfehler exakt — die globalen KPIs (die über alle
// ad_spend-Zeilen summieren) ändern sich dadurch praktisch nicht.
export function splitTotal(total: number, weights: number[], round: boolean): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) { out.push(total - acc); }
    else {
      const raw = (total * weights[i]) / sum;
      const v = round ? Math.round(raw) : raw;
      out.push(v); acc += v;
    }
  }
  return out;
}

// Demo-Kampagnen je Plattform — Namen folgen der Stage-Konvention (siehe src/kpi/campaigns.ts).
export const DEMO_CAMPAIGNS: Record<AdPlatform, { id: string; name: string; weight: number }[]> = {
  google_ads: [
    { id: 'g-prospecting', name: 'Prospecting_Search', weight: 0.4 },
    { id: 'g-traffic',     name: 'Traffic_Discovery',  weight: 0.3 },
    { id: 'g-retargeting', name: 'Retargeting_Q3',     weight: 0.3 },
  ],
  meta_ads: [
    { id: 'm-prospecting', name: 'Prospecting_Video',       weight: 0.5 },
    { id: 'm-retargeting', name: 'Retargeting_DPA',         weight: 0.3 },
    { id: 'm-newsletter',  name: 'Newsletter_Reactivation', weight: 0.2 },
  ],
  tiktok_ads: [
    { id: 't-awareness',  name: 'Awareness_Spark',    weight: 0.7 },
    { id: 't-conversion', name: 'Conversion_Catalog', weight: 0.3 },
  ],
  // Amazon Ads liefert echte Daten über den Hub — keine Demo-Kampagnen (nicht in PLATFORMS).
  amazon_ads: [],
};

export function generateSeedData(range: DateRange): CanonicalDataset {
  const r = rng(20260617);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const dates = Array.from({ length: totalDays }, (_, i) => addDays(range.start, i));

  const dailyMetrics: DailyMetric[] = [];
  const adSpend: CanonicalDataset['adSpend'] = [];
  const subscribers: Subscriber[] = [];
  const orders: Order[] = [];

  // Wachsender Traffic-Trend über die Zeit + leichtes Rauschen.
  dates.forEach((date, i) => {
    const trend = 1 + i / totalDays;
    const sessions = Math.round((800 + r() * 400) * trend);
    const totalUsers = Math.round(sessions * (0.85 + r() * 0.1));
    const m = (metricKey: string, value: number) =>
      dailyMetrics.push({ date, source: 'ga4', channel: 'default', metricKey, value });
    m('sessions', sessions);
    m('total_users', totalUsers);
    m('returning_users', Math.round(totalUsers * (0.25 + r() * 0.1)));
    m('pageviews', Math.round(sessions * (2.5 + r())));
    m('bounced_sessions', Math.round(sessions * (0.35 + r() * 0.15)));
    m('add_to_carts', Math.round(sessions * (0.08 + r() * 0.05)));
    m('checkouts_started', Math.round(sessions * (0.04 + r() * 0.02)));
    dailyMetrics.push({ date, source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: Math.round(2000 * trend + r() * 800) });

    for (const platform of PLATFORMS) {
      const impressions = Math.round((30_000 + r() * 20_000) * trend);
      const spend = Math.round((150 + r() * 120) * trend);
      const clicks = Math.round(impressions * (0.01 + r() * 0.01));
      const conversions = Math.round(clicks * (0.03 + r() * 0.02));
      const convValue = conversions * (60 + r() * 40);
      const camps = DEMO_CAMPAIGNS[platform];
      const w = camps.map((c) => c.weight);
      const sp = splitTotal(spend, w, true);
      const im = splitTotal(impressions, w, true);
      const cl = splitTotal(clicks, w, true);
      const cv = splitTotal(conversions, w, true);
      const vv = splitTotal(convValue, w, false);
      camps.forEach((c, k) => {
        adSpend.push({ date, platform, spend: sp[k], impressions: im[k], clicks: cl[k],
          conversions: cv[k], convValue: vv[k], campaignId: c.id, campaignName: c.name });
      });
    }

    subscribers.push({
      date, source: 'klaviyo',
      signups: Math.round(20 + r() * 30), unsubscribes: Math.round(r() * 8),
      npsScore: i % 7 === 0 ? Math.round(30 + r() * 40) : null,
    });
  });

  // Kunden + Bestellungen: fester Stamm, ~30% Wiederkäufer.
  const customerCount = 220;
  const customers: Customer[] = [];
  for (let c = 0; c < customerCount; c++) {
    const customerId = `c${c + 1}`;
    const nOrders = r() < 0.3 ? 2 + Math.floor(r() * 3) : 1;
    const custOrders: Order[] = [];
    for (let o = 0; o < nOrders; o++) {
      const dayIdx = Math.floor(r() * totalDays);
      const revenue = Math.round((40 + r() * 160) * 100) / 100;
      custOrders.push({
        orderId: `${customerId}-o${o + 1}`, customerId, date: dates[dayIdx],
        revenue, isFirstOrder: false,
      });
    }
    custOrders.sort((a, b) => a.date.localeCompare(b.date));
    custOrders[0].isFirstOrder = true;
    orders.push(...custOrders);
    customers.push({
      customerId,
      firstOrderDate: custOrders[0].date,
      lastOrderDate: custOrders[custOrders.length - 1].date,
      ordersCount: custOrders.length,
      totalRevenue: Math.round(custOrders.reduce((s, o) => s + o.revenue, 0) * 100) / 100,
    });
  }

  return { dailyMetrics, orders, customers, adSpend, subscribers };
}
