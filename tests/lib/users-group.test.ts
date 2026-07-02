import { describe, it, expect, vi, beforeEach } from 'vitest';

const createUserMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser: createUserMock } } }),
}));
vi.mock('@/lib/groups', () => ({ addUserToDefaultGroup: vi.fn() }));

import { createUser } from '@/lib/users';
import { addUserToDefaultGroup } from '@/lib/groups';

beforeEach(() => {
  createUserMock.mockReset();
  vi.mocked(addUserToDefaultGroup).mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
});

describe('createUser', () => {
  it('adds the newly created user to the default group', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'new-id' } }, error: null });
    await createUser('a@b.de', 'secret1');
    expect(addUserToDefaultGroup).toHaveBeenCalledWith('new-id');
  });

  it('does not touch groups when auth creation fails', async () => {
    createUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    await expect(createUser('a@b.de', 'secret1')).rejects.toThrow('boom');
    expect(addUserToDefaultGroup).not.toHaveBeenCalled();
  });
});
