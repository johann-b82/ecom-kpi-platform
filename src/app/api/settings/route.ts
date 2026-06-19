import { NextResponse } from 'next/server';
import { getBranding, setBranding } from '@/lib/settings';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(await getBranding());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { title?: string; tagline?: string; logo?: string | null };
  await setBranding(body);
  return NextResponse.json({ ok: true });
}
