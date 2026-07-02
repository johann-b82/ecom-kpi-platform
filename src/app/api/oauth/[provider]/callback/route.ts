import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/oauth/providers';
import { loadAppCredentials } from '@/lib/oauth/token';
import { saveConnection } from '@/lib/oauth/store';
import { redirectUriFor, STATE_COOKIE } from '@/lib/oauth/redirect';

export const dynamic = 'force-dynamic';

function setupRedirect(request: Request, query: string) {
  return NextResponse.redirect(new URL(`/setup?${query}`, request.url));
}

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });

  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) return setupRedirect(request, `oauth=${provider.key}&error=${encodeURIComponent(err)}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.headers.get('cookie')?.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }

  const creds = await loadAppCredentials(provider.key);
  if (!creds) return NextResponse.json({ error: 'missing app credentials' }, { status: 400 });

  let token;
  try {
    token = await provider.exchangeCode(code, redirectUriFor(request, provider.key), creds);
  } catch (e) {
    return setupRedirect(request, `oauth=${provider.key}&error=${encodeURIComponent((e as Error).message)}`);
  }
  await saveConnection(provider.key, token);

  const res = setupRedirect(request, `oauth=${provider.key}&connected=1`);
  res.cookies.set(STATE_COOKIE, '', { path: '/api/oauth', maxAge: 0 });
  return res;
}
