import { describe, it, expect } from 'vitest';
import { accessibleApps } from '@/lib/groups';

describe('accessibleApps', () => {
  it('admin sees every app', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: true }).map((a) => a.key);
    expect(keys).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'katalog', 'kontakte', 'brickpm', 'hilfe']);
  });

  it('non-admin without rights still sees hilfe (baseline app)', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['hilfe']);
  });

  it('non-admin with brickpm access sees brickpm + hilfe', () => {
    const keys = accessibleApps({ apps: { brickpm: 'view' }, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['brickpm', 'hilfe']);
  });
});
