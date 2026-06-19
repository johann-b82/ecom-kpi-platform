import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: () => {} }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

describe('supabase server client factory', () => {
  it('returns a client exposing auth + from', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    expect(typeof supabase.auth.getUser).toBe('function');
    expect(typeof supabase.from).toBe('function');
  });
});
