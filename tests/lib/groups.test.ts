import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { getUserAccess, requireAppAccess } from '@/lib/groups';
import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

const q = () => vi.mocked(pool.query);
beforeEach(() => { q().mockReset(); });

describe('getUserAccess', () => {
  it('no membership + groups exist → no access (grandfather only when system empty)', async () => {
    q().mockResolvedValueOnce({ rows: [] } as never)          // membership query
     .mockResolvedValueOnce({ rows: [{ n: 2 }] } as never);   // group count
    const a = await getUserAccess('u1');
    expect(a).toEqual({ apps: {}, isAdmin: false });
  });

  it('no membership + zero groups → full admin (fresh install)', async () => {
    q().mockResolvedValueOnce({ rows: [] } as never)
     .mockResolvedValueOnce({ rows: [{ n: 0 }] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({ brickpm: 'edit', kontakte: 'edit', katalog: 'edit', verkauf: 'edit', verfuegbarkeit: 'edit', finanzen: 'edit', hilfe: 'edit' });
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

  it('does NOT grandfather an admin group that has no app access (rows present, app null)', async () => {
    // The tricky case: membership rows exist (length > 0) but the group grants no app.
    // Must yield isAdmin=true with NO app access — never the full-admin grandfather.
    q().mockResolvedValue({ rows: [
      { is_admin: true, app: null, permission: null },
    ] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({});
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

  it('throws when the user has no access to the requested app at all', async () => {
    mockUser('u1');
    q().mockResolvedValue({ rows: [{ is_admin: false, app: 'brickpm', permission: 'edit' }] } as never);
    await expect(requireAppAccess('kontakte')).rejects.toThrow(/Kein Zugriff/i);
  });

  it('throws when unauthenticated', async () => {
    mockUser(null);
    await expect(requireAppAccess('brickpm')).rejects.toThrow(/nicht angemeldet|not authenticated/i);
  });
});
