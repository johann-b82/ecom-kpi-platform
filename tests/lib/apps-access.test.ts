import { describe, it, expect } from 'vitest';
import { accessibleApps } from '@/lib/groups';

describe('accessibleApps', () => {
  it('admin sees every app', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: true }).map((a) => a.key);
    expect(keys).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'katalog', 'kontakte', 'hilfe']);
  });

  it('non-admin without rights still sees hilfe (baseline app)', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['hilfe']);
  });

  it('non-admin with kontakte access sees kontakte + hilfe', () => {
    const keys = accessibleApps({ apps: { kontakte: 'view' }, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['kontakte', 'hilfe']);
  });
});
