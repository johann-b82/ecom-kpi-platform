import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { getUserAccess, requireAppAccess } from '@/lib/groups';
import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

const q = () => vi.mocked(pool.query);
beforeEach(() => { q().mockReset(); });

describe('getUserAccess', () => {
  it('grants full admin when the user is in no group (grandfather)', async () => {
    q().mockResolvedValue({ rows: [] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({ dashboard: 'edit', brickpm: 'edit' });
  });

  it('aggregates the strongest right per app and admin from any admin group', async () => {
    q().mockResolvedValue({ rows: [
      { is_admin: false, app: 'dashboard', permission: 'view' },
      { is_admin: true,  app: 'brickpm',   permission: 'view' },
      { is_admin: false, app: 'brickpm',   permission: 'edit' },
    ] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({ dashboard: 'view', brickpm: 'edit' });
  });

  it('a member of a limited non-admin group gets only that access', async () => {
    q().mockResolvedValue({ rows: [
      { is_admin: false, app: 'brickpm', permission: 'view' },
    ] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(false);
    expect(a.apps).toEqual({ brickpm: 'view' });
  });
});

describe('requireAppAccess', () => {
  function mockUser(id: string | null) {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never);
  }

  it('passes when the user has the required right (edit satisfies view)', async () => {
    mockUser('u1');
    q().mockResolvedValue({ rows: [{ is_admin: false, app: 'brickpm', permission: 'edit' }] } as never);
    await expect(requireAppAccess('brickpm', 'view')).resolves.toBeUndefined();
  });

  it('throws when the user lacks edit', async () => {
    mockUser('u1');
    q().mockResolvedValue({ rows: [{ is_admin: false, app: 'brickpm', permission: 'view' }] } as never);
    await expect(requireAppAccess('brickpm', 'edit')).rejects.toThrow(/Kein Zugriff/i);
  });

  it('throws when unauthenticated', async () => {
    mockUser(null);
    await expect(requireAppAccess('brickpm')).rejects.toThrow(/nicht angemeldet|not authenticated/i);
  });
});
