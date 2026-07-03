import type { BpmProduct, BpmCompetitor } from './types';

export interface PricePoint { productId: string; date: string; price: number; cost: number }
export interface CompPoint { productId: string; competitor: string; date: string; ownPrice: number; compPrice: number }

// Fixed monthly anchor dates (oldest → newest); newest equals the products' current values.
export const MONTH_DATES = [
  '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01',
  '2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01',
];

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// Deterministic drift: older months differ from the current value by a small per-entity step.
// Newest point (last date) has factor 1 → exactly the current value.
function factor(key: string, k: number): number {
  const step = (((hash(key) % 11) - 5) / 1000); // deterministic, ±0.5% per month
  return 1 + (MONTH_DATES.length - 1 - k) * step;
}

export function buildPriceHistory(products: BpmProduct[]): PricePoint[] {
  const out: PricePoint[] = [];
  for (const p of products) {
    MONTH_DATES.forEach((date, k) => {
      const f = factor(p.id, k);
      out.push({ productId: p.id, date, price: round2(p.price * f), cost: round2(p.cost * f) });
    });
  }
  return out;
}

export function buildCompetitorPrices(competitors: BpmCompetitor[]): CompPoint[] {
  const out: CompPoint[] = [];
  for (const c of competitors) {
    MONTH_DATES.forEach((date, k) => {
      const fo = factor(`${c.productId}${c.competitor}o`, k);
      const fc = factor(`${c.productId}${c.competitor}c`, k);
      out.push({
        productId: c.productId, competitor: c.competitor, date,
        ownPrice: round2(c.ownPrice * fo), compPrice: round2(c.compPrice * fc),
      });
    });
  }
  return out;
}
