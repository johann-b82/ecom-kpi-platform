import type { BpmProduct, BpmPromotion, BpmCompetitor } from './types';
import { deviation } from './format';

export interface NamedValue { name: string; value: number }

export function revenueByCategory(products: BpmProduct[], promotions: BpmPromotion[]): NamedValue[] {
  const catOf = new Map(products.map((p) => [p.id, p.cat]));
  const acc = new Map<string, number>();
  for (const a of promotions) {
    const cat = catOf.get(a.productId) ?? 'Sonstige';
    acc.set(cat, (acc.get(cat) ?? 0) + a.targetRev);
  }
  return [...acc.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

export function margeBySeries(products: BpmProduct[]): NamedValue[] {
  const sums = new Map<string, { s: number; n: number }>();
  for (const p of products) {
    if (p.price <= 0) continue;
    const cur = sums.get(p.series) ?? { s: 0, n: 0 };
    cur.s += (p.price - p.cost) / p.price;
    cur.n += 1;
    sums.set(p.series, cur);
  }
  return [...sums.entries()]
    .map(([name, { s, n }]) => ({ name, value: Math.round((s / n) * 1000) / 10 })) // % with 1 decimal
    .sort((a, b) => b.value - a.value);
}

export function sellThrough(promotions: BpmPromotion[]): NamedValue[] {
  return promotions
    .map((a) => ({ name: a.name, value: a.targetUnits > 0 ? Math.round((a.sold / a.targetUnits) * 100) : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function statusDistribution(products: BpmProduct[]): NamedValue[] {
  const acc = new Map<string, number>();
  for (const p of products) acc.set(p.status, (acc.get(p.status) ?? 0) + 1);
  return [...acc.entries()].map(([name, value]) => ({ name, value }));
}

export interface ReorderRow { id: string; name: string; stock: number; minStock: number; reorder: number }
export function reorderList(products: BpmProduct[]): ReorderRow[] {
  return products
    .filter((p) => p.stock < p.minStock)
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock, minStock: p.minStock, reorder: 2 * p.minStock - p.stock }))
    .sort((a, b) => a.stock - b.stock);
}

export function deviationAlerts(competitors: BpmCompetitor[], threshold = 0.05): BpmCompetitor[] {
  return competitors.filter((c) => Math.abs(deviation(c.ownPrice, c.compPrice)) >= threshold);
}
