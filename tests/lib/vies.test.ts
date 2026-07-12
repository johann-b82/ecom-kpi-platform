import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseVatId, checkVatId } from '@/lib/vies';

describe('parseVatId', () => {
  it('splits country + number, strips spaces, upcases', () => {
    expect(parseVatId('de 811 907 980')).toEqual({ country: 'DE', number: '811907980' });
  });
  it('rejects malformed input', () => {
    expect(parseVatId('12345')).toBeNull();
    expect(parseVatId('')).toBeNull();
  });
});

describe('checkVatId', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns a format error without calling the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const r = await checkVatId('nope');
    expect(r).toEqual({ valid: false, error: 'Ungültiges Format.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a valid VIES response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true, json: async () => ({ valid: true, name: 'ACME GmbH' }),
    })));
    expect(await checkVatId('DE811907980')).toEqual({ valid: true, name: 'ACME GmbH' });
  });

  it('degrades gracefully when VIES is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await checkVatId('DE811907980')).toEqual({ valid: false, error: 'VIES nicht erreichbar.' });
  });
});
