import type { OrderCost } from './types';

export function contributionMargin(
  revenueNet: number, costs: OrderCost[],
): { db: number; dbProzent: number | null } {
  const total = costs.reduce((s, c) => s + c.amount, 0);
  const db = revenueNet - total;
  return { db, dbProzent: revenueNet !== 0 ? db / revenueNet : null };
}
