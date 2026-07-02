import type { BpmProduct, BpmPromotion, BpmNotification } from './types';

export interface CockpitStats {
  produkte: number; kritisch: number; preorder: number;
  aktiveAktionen: number; avgMarge: number; offeneNotifs: number;
}

export function computeCockpitStats(
  products: BpmProduct[], promotions: BpmPromotion[], notifications: BpmNotification[],
): CockpitStats {
  const priced = products.filter((p) => p.price > 0);
  const avgMarge = priced.length
    ? priced.reduce((s, p) => s + (p.price - p.cost) / p.price, 0) / priced.length
    : 0;
  return {
    produkte: products.length,
    kritisch: products.filter((p) => p.stock < p.minStock).length,
    preorder: products.filter((p) => p.status === 'preorder').length,
    aktiveAktionen: promotions.filter((a) => a.status === 'aktiv').length,
    avgMarge,
    offeneNotifs: notifications.filter((n) => n.status === 'offen').length,
  };
}

const PRIO_RANK: Record<string, number> = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3 };

export function sortHeuteWichtig(notifications: BpmNotification[]): BpmNotification[] {
  return notifications
    .filter((n) => n.status === 'offen')
    .sort((a, b) => {
      const pr = (PRIO_RANK[a.priority] ?? 9) - (PRIO_RANK[b.priority] ?? 9);
      if (pr !== 0) return pr;
      return (a.due ?? '9999').localeCompare(b.due ?? '9999');
    })
    .slice(0, 5);
}
