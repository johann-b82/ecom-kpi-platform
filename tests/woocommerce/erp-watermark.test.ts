import { describe, it, expect } from 'vitest';
import { shouldErpFullResync } from '@/woocommerce/erp-watermark';

const FULL_MAX_AGE_MS = 72_000_000; // 20h

describe('shouldErpFullResync', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('erzwingt full, wenn noch nie gelaufen', () => {
    expect(shouldErpFullResync(null, null, now)).toBe(true);
  });

  it('erzwingt full, wenn der letzte Full älter als 20h ist', () => {
    const old = new Date(now.getTime() - FULL_MAX_AGE_MS - 1000);
    expect(shouldErpFullResync(now, old, now)).toBe(true);
  });

  it('bleibt inkrementell, wenn der Full frisch ist', () => {
    const fresh = new Date(now.getTime() - 60_000);
    expect(shouldErpFullResync(now, fresh, now)).toBe(false);
  });
});
