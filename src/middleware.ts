import { auth } from '@/auth';
import { NextResponse } from 'next/server';

export default auth((req) => {
  if (req.auth) return NextResponse.next();

  const { pathname, href, origin } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const signInUrl = new URL('/api/auth/signin', origin);
  signInUrl.searchParams.set('callbackUrl', href);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ['/((?!api/auth/|_next/static|_next/image|favicon.ico).*)'],
};
