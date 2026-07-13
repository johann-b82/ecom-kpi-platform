import { describe, it, expect } from 'vitest';
import { APPS } from '@/lib/apps';
import { accessibleApps } from '@/lib/groups';

describe('hilfe app registration', () => {
  it('is registered in APPS with the expected shape', () => {
    const hilfe = APPS.find((a) => a.key === 'hilfe');
    expect(hilfe).toEqual({ key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' });
  });

  it('is visible to a non-admin user without any app grants', () => {
    const apps = accessibleApps({ apps: {}, isAdmin: false });
    expect(apps.map((a) => a.key)).toContain('hilfe');
  });
});
