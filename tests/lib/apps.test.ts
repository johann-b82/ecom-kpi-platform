import { describe, it, expect } from 'vitest';
import { APPS, APP_KEYS } from '@/lib/apps';

describe('app registry', () => {
  it('registers kontakte and katalog with KO/KA abbrs', () => {
    const kontakte = APPS.find((a) => a.key === 'kontakte');
    const katalog = APPS.find((a) => a.key === 'katalog');
    expect(kontakte).toMatchObject({ abbr: 'KO', href: '/kontakte' });
    expect(katalog).toMatchObject({ abbr: 'KA', href: '/katalog' });
    expect(APP_KEYS).toContain('kontakte');
    expect(APP_KEYS).toContain('katalog');
  });
});
