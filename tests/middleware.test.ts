import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let user: { email: string } | null = null;
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

async function run(path: string) {
  const { middleware } = await import('@/middleware');
  return middleware(new NextRequest(`http://localhost:3000${path}`));
}

describe('middleware auth gate', () => {
  it('redirects unauthenticated page requests to /login', async () => {
    user = null;
    const res = await run('/');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });
  it('returns 401 JSON for unauthenticated /api requests', async () => {
    user = null;
    const res = await run('/api/kpis');
    expect(res.status).toBe(401);
  });
  it('passes through when authenticated', async () => {
    user = { email: 'a@b.de' };
    const res = await run('/');
    expect(res.status).toBe(200);
  });
});
