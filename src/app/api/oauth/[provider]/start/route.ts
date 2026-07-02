import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getProvider } from '@/lib/oauth/providers';
import { loadAppCredentials } from '@/lib/oauth/token';
import { redirectUriFor, resolveOrigin, STATE_COOKIE } from '@/lib/oauth/redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });

  const creds = await loadAppCredentials(provider.key);
  if (!creds) {
    return NextResponse.json({ error: `${provider.label} OAuth client id/secret fehlen` }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = redirectUriFor(request, provider.key);
  const res = NextResponse.redirect(provider.authorizeUrl(redirectUri, state, creds));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: resolveOrigin(request).proto === 'https',
    path: `/api/oauth`,
    maxAge: 600,
  });
  return res;
}
