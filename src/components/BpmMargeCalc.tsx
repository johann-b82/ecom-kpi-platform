'use client';
import { useState } from 'react';
import type { BpmProduct } from '@/brickpm/types';
import { computeMarge } from '@/brickpm/marge';
import { eur, pct } from '@/brickpm/format';

const inputClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

const RECO_TONE: Record<string, string> = {
  green: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  neutral: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
};
function recoTone(r: string): string {
  if (r.startsWith('Keine Maßnahme')) return RECO_TONE.green;
  if (r.startsWith('Rabatt gesperrt')) return RECO_TONE.red;
  return RECO_TONE.amber;
}

export function BpmMargeCalc({ products }: { products: BpmProduct[] }) {
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [mode, setMode] = useState<'pct' | 'eur'>('pct');
  const [discPct, setDiscPct] = useState(0);
  const [discEur, setDiscEur] = useState(0);
  const [goodieCost, setGoodieCost] = useState(0);
  const [targetRev, setTargetRev] = useState(10000);

  const product = products.find((p) => p.id === productId);
  if (!product) return null;
  const r = computeMarge({ product, discPct, discEur, goodieCost, targetRev, mode });

  const num = (v: string) => (v === '' ? 0 : Number(v));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
      <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <label className="block text-sm">
          <span className="mb-1 block text-neutral-500">Produkt</span>
          <select className={`${inputClass} w-full`} value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
          </select>
        </label>
        <div className="text-xs text-neutral-500">
          Preis {eur(product.price)} · Kosten {eur(product.cost)} · Zielmarge {pct(product.tMgn)} · Mindestmarge {pct(product.mMgn)}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setMode('pct')} className={`rounded-md border px-3 py-1 text-sm ${mode === 'pct' ? 'border-brand text-brand' : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'}`}>Rabatt %</button>
          <button type="button" onClick={() => setMode('eur')} className={`rounded-md border px-3 py-1 text-sm ${mode === 'eur' ? 'border-brand text-brand' : 'border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300'}`}>Rabatt €</button>
        </div>
        {mode === 'pct' ? (
          <label className="block text-sm"><span className="mb-1 block text-neutral-500">Rabatt (%)</span>
            <input type="number" className={`${inputClass} w-full`} value={discPct} onChange={(e) => setDiscPct(num(e.target.value))} /></label>
        ) : (
          <label className="block text-sm"><span className="mb-1 block text-neutral-500">Rabatt (€)</span>
            <input type="number" className={`${inputClass} w-full`} value={discEur} onChange={(e) => setDiscEur(num(e.target.value))} /></label>
        )}
        <label className="block text-sm"><span className="mb-1 block text-neutral-500">Goodie-Kosten (€)</span>
          <input type="number" className={`${inputClass} w-full`} value={goodieCost} onChange={(e) => setGoodieCost(num(e.target.value))} /></label>
        <label className="block text-sm"><span className="mb-1 block text-neutral-500">Zielumsatz (€)</span>
          <input type="number" className={`${inputClass} w-full`} value={targetRev} onChange={(e) => setTargetRev(num(e.target.value))} /></label>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { l: 'Effektiver Preis', v: eur(r.effPrice) },
            { l: 'Deckungsbeitrag', v: eur(r.db) },
            { l: 'Marge', v: pct(r.marge) },
            { l: 'Max. Rabatt', v: eur(Math.max(0, r.maxDiscEur)) },
            { l: 'Benötigte Stück', v: String(r.neededUnits) },
          ].map((k) => (
            <div key={k.l} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="text-2xl font-bold tabular-nums text-neutral-900 dark:text-neutral-100">{k.v}</div>
              <div className="mt-1 text-xs text-neutral-500">{k.l}</div>
            </div>
          ))}
        </div>
        <div className={`rounded-lg p-4 text-sm font-medium ${recoTone(r.recommendation)}`}>
          Empfehlung: {r.recommendation}
        </div>
      </div>
    </div>
  );
}
