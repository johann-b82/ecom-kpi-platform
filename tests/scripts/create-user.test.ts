import { describe, it, expect, vi, beforeEach } from 'vitest';

const createUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser } } }),
}));

beforeEach(() => {
  vi.resetModules();
  createUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.LOCAL_USER_EMAIL = 'admin@x.de';
  process.env.LOCAL_USER_PASSWORD = 'pw';
});

describe('createInitialUser', () => {
  it('creates the user from env', async () => {
    createUser.mockResolvedValue({ data: { user: { email: 'admin@x.de' } }, error: null });
    const { createInitialUser } = await import('../../scripts/create-user');
    await createInitialUser();
    expect(createUser).toHaveBeenCalledWith({ email: 'admin@x.de', password: 'pw', email_confirm: true });
  });
  it('is idempotent when the user already exists', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
    const { createInitialUser } = await import('../../scripts/create-user');
    await expect(createInitialUser()).resolves.toBeUndefined();
  });
});
