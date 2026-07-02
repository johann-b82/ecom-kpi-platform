import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/oauth/providers';
import { deleteConnection } from '@/lib/oauth/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  await deleteConnection(provider.key);
  return NextResponse.redirect(new URL(`/setup?oauth=${provider.key}&disconnected=1`, request.url));
}
