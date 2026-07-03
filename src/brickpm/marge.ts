import type { BpmProduct } from './types';

export interface MargeInput { product: BpmProduct; discPct: number; discEur: number; goodieCost: number; targetRev: number; mode: 'pct' | 'eur' }
export interface MargeResult { effPrice: number; db: number; marge: number; maxDiscPrice: number; maxDiscEur: number; neededUnits: number; recommendation: string }

export function computeMarge(i: MargeInput): MargeResult {
  const p = i.product;
  const disc = i.mode === 'pct' ? (p.price * i.discPct) / 100 : i.discEur;
  const effPrice = Math.max(0, p.price - disc);
  const db = effPrice - p.cost - i.goodieCost;
  const marge = effPrice > 0 ? db / effPrice : 0;
  const maxDiscPrice = p.cost / (1 - p.mMgn);
  const maxDiscEur = p.uvp - maxDiscPrice;
  const neededUnits = effPrice > 0 ? Math.ceil(i.targetRev / effPrice) : 0;
  let recommendation: string;
  if (marge >= p.tMgn) recommendation = 'Keine Maßnahme nötig';
  else if (i.goodieCost > 0 && i.goodieCost < disc) recommendation = 'Goodie statt Rabatt empfohlen';
  else if (marge >= p.mMgn + 0.05) recommendation = 'Bundle statt Rabatt empfohlen';
  else if (marge >= p.mMgn + 0.02) recommendation = 'Moderater Rabatt möglich';
  else if (marge >= p.mMgn) recommendation = 'Abverkaufsaktion empfehlen';
  else recommendation = 'Rabatt gesperrt – Mindestmarge unterschritten';
  return { effPrice, db, marge, maxDiscPrice, maxDiscEur, neededUnits, recommendation };
}
