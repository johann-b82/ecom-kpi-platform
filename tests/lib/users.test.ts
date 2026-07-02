import { describe, it, expect, vi, beforeEach } from 'vitest';

const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const deleteUserMock = vi.fn();
const updateUserByIdMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { admin: { listUsers: listUsersMock, createUser: createUserMock, deleteUser: deleteUserMock, updateUserById: updateUserByIdMock } },
  }),
}));

beforeEach(() => {
  vi.resetModules();
  for (const m of [listUsersMock, createUserMock, deleteUserMock, updateUserByIdMock]) m.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc';
});

describe('users admin', () => {
  it('listUsers maps fields and sorts by email', async () => {
    listUsersMock.mockResolvedValue({
      data: { users: [
        { id: '2', email: 'b@x.de', created_at: '2026-01-02', last_sign_in_at: null },
        { id: '1', email: 'a@x.de', created_at: '2026-01-01', last_sign_in_at: '2026-06-01' },
      ] },
      error: null,
    });
    const { listUsers } = await import('@/lib/users');
    const u = await listUsers();
    expect(u.map((x) => x.email)).toEqual(['a@x.de', 'b@x.de']);
    expect(u[0]).toEqual({ id: '1', email: 'a@x.de', createdAt: '2026-01-01', lastSignInAt: '2026-06-01' });
  });

  it('createUser passes email_confirm: true', async () => {
    createUserMock.mockResolvedValue({ data: { user: null }, error: null });
    const { createUser } = await import('@/lib/users');
    await createUser('n@x.de', 'secret');
    expect(createUserMock).toHaveBeenCalledWith({ email: 'n@x.de', password: 'secret', email_confirm: true });
  });

  it('updateUserPassword + deleteUser call through; errors throw', async () => {
    updateUserByIdMock.mockResolvedValue({ error: null });
    deleteUserMock.mockResolvedValue({ error: { message: 'boom' } });
    const { updateUserPassword, deleteUser } = await import('@/lib/users');
    await updateUserPassword('1', 'newpw');
    expect(updateUserByIdMock).toHaveBeenCalledWith('1', { password: 'newpw' });
    await expect(deleteUser('1')).rejects.toThrow('boom');
  });
});
