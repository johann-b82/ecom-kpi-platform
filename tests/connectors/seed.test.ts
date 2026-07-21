import { describe, it, expect } from 'vitest';
import { generateSeedData, splitTotal, DEMO_CAMPAIGNS } from '@/connectors/seed/generator';

const range = { start: '2026-01-01', end: '2026-03-31' };

describe('generateSeedData', () => {
  it('ist deterministisch (gleicher Range → gleiche Werte)', () => {
    const a = generateSeedData(range);
    const b = generateSeedData(range);
    expect(a.orders.length).toBe(b.orders.length);
    expect(a.dailyMetrics[0]).toEqual(b.dailyMetrics[0]);
  });
  it('liefert für jeden Tag GA4-Sessions und Ads-Spend', () => {
    const data = generateSeedData(range);
    const days = 90; // Jan(31)+Feb(28)+Mar(31)
    expect(data.dailyMetrics.filter((m) => m.metricKey === 'sessions').length).toBe(days);
    expect(data.adSpend.length).toBeGreaterThan(0);
  });
  it('Kundenaggregate sind mit Orders konsistent', () => {
    const data = generateSeedData(range);
    const c = data.customers[0];
    const orders = data.orders.filter((o) => o.customerId === c.customerId);
    expect(c.ordersCount).toBe(orders.length);
    expect(c.totalRevenue).toBeCloseTo(orders.reduce((s, o) => s + o.revenue, 0));
  });
});

describe('splitTotal', () => {
  it('erhält die Summe exakt (Rundungsrest auf die letzte Kampagne)', () => {
    const parts = splitTotal(100, [0.4, 0.3, 0.3], true);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.length).toBe(3);
  });
  it('erhält auch Float-Summen exakt', () => {
    const parts = splitTotal(10.5, [0.5, 0.5], false);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10.5, 10);
  });
});

describe('generateSeedData Kampagnen', () => {
  it('erzeugt benannte Demo-Kampagnen je Plattform mit Stage-Abdeckung', () => {
    const data = generateSeedData({ start: '2026-01-01', end: '2026-01-10' });
    // Gruppiere nach date+platform und prüfe: mehrere Kampagnen, alle mit Namen.
    const metaRows = data.adSpend.filter((a) => a.platform === 'meta_ads' && a.date === '2026-01-01');
    expect(metaRows.length).toBeGreaterThan(1);
    expect(metaRows.every((r) => !!r.campaignName)).toBe(true);
    // Stage-Abdeckung: mindestens SEE, DO und CARE unter den Demo-Kampagnen.
    const names = data.adSpend.map((r) => r.campaignName!);
    expect(names.some((n) => /Prospecting/.test(n))).toBe(true);   // see
    expect(names.some((n) => /Retargeting/.test(n))).toBe(true);   // do
    expect(names.some((n) => /Newsletter/.test(n))).toBe(true);    // care
  });

  // Referenzwerte eingefroren aus commit 3babb6d (Stand vor der Kampagnenebene):
  // dort war ad_spend noch eine Zeile je (date, platform) ohne Split. Diese vier
  // Summen über den Range 2026-01-01..2026-03-31 wurden dort einmalig ermittelt
  // und müssen nach dem Split auf Kampagnen unverändert bleiben (Invariante).
  it('erhält Spend/Impressions/Klicks/Conversions in Summe verlustfrei (Invariante, Referenzwerte aus 3babb6d)', () => {
    const range = { start: '2026-01-01', end: '2026-03-31' };
    const data = generateSeedData(range);
    const totals = data.adSpend.reduce(
      (acc, a) => {
        acc.spend += a.spend;
        acc.impressions += a.impressions;
        acc.clicks += a.clicks;
        acc.conversions += a.conversions;
        return acc;
      },
      { spend: 0, impressions: 0, clicks: 0, conversions: 0 },
    );
    expect(totals.spend).toBe(84175);
    expect(totals.impressions).toBe(16184030);
    expect(totals.clicks).toBe(245246);
    expect(totals.conversions).toBe(9792);
  });

  it('jede (date, platform)-Gruppe enthält genau die erwarteten Demo-Kampagnen', () => {
    const data = generateSeedData({ start: '2026-01-01', end: '2026-01-10' });
    const groups = new Map<string, typeof data.adSpend>();
    for (const row of data.adSpend) {
      const key = `${row.date}|${row.platform}`;
      const g = groups.get(key) ?? [];
      g.push(row);
      groups.set(key, g);
    }
    for (const [key, rows] of groups) {
      const [, platform] = key.split('|') as [string, keyof typeof DEMO_CAMPAIGNS];
      const expectedIds = DEMO_CAMPAIGNS[platform].map((c) => c.id);
      expect(rows.length).toBe(expectedIds.length);
      expect(rows.map((r) => r.campaignId).sort()).toEqual([...expectedIds].sort());
    }
  });
});
