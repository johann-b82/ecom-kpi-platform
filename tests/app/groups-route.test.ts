import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/groups', () => ({
  getUserAccess: vi.fn(),
  listGroups: vi.fn(async () => []),
  createGroup: vi.fn(async () => 'gid'),
  setAdmin: vi.fn(),
  setMembers: vi.fn(),
}));
vi.mock('@/lib/users', () => ({ listUsers: vi.fn(async () => []) }));

import { GET, POST } from '@/app/api/groups/route';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, createGroup, setAdmin } from '@/lib/groups';

function auth(id: string | null) {
  vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never);
}
function req(body: unknown) { return new Request('http://x/api/groups', { method: 'POST', body: JSON.stringify(body) }); }

beforeEach(() => { vi.mocked(getUserAccess).mockReset(); vi.mocked(createGroup).mockReset(); vi.mocked(setAdmin).mockReset(); });

describe('/api/groups', () => {
  it('GET 403 for a non-admin', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    expect((await GET()).status).toBe(403);
  });

  it('GET returns groups+users for an admin', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groups: [], users: [] });
  });

  it('POST create dispatches to the store for an admin', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    const res = await POST(req({ action: 'create', name: 'Neue Gruppe' }));
    expect(res.status).toBe(200);
    expect(createGroup).toHaveBeenCalledWith('Neue Gruppe');
  });

  it('POST 403 for a non-admin (no mutation)', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    const res = await POST(req({ action: 'create', name: 'X' }));
    expect(res.status).toBe(403);
    expect(createGroup).not.toHaveBeenCalled();
  });

  it('POST 400 when the store rejects the mutation (e.g. last-admin-group guard)', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    vi.mocked(setAdmin).mockRejectedValue(new Error('Es muss mindestens eine Admin-Gruppe geben.'));
    const res = await POST(req({ action: 'setAdmin', id: 'gid', isAdmin: false }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Es muss mindestens eine Admin-Gruppe geben.' });
  });
});
