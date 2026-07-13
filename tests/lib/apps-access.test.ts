import { describe, it, expect } from 'vitest';
import { accessibleApps } from '@/lib/groups';

describe('accessibleApps', () => {
  it('admin sees every app', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: true }).map((a) => a.key);
    expect(keys).toEqual(['dashboard', 'brickpm', 'kontakte', 'katalog', 'hilfe']);
  });

  it('non-admin without rights still sees the dashboard (baseline app)', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['dashboard', 'hilfe']);
  });

  it('non-admin with brickpm access sees dashboard + brickpm', () => {
    const keys = accessibleApps({ apps: { brickpm: 'view' }, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['dashboard', 'brickpm', 'hilfe']);
  });
});
