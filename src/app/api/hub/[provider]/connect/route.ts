import { NextResponse } from 'next/server';
import { createHubConnectSession, HubNotConfiguredError, type HubProvider } from '@/lib/hub';
import { appUrl } from '@/lib/oauth/redirect';

export const dynamic = 'force-dynamic';

const HUB_PROVIDERS: HubProvider[] = ['amazon_ads', 'amazon_sp'];

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  if (!HUB_PROVIDERS.includes(params.provider as HubProvider)) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  }
  try {
    const url = await createHubConnectSession(params.provider as HubProvider, appUrl(request, '/setup'));
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof HubNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hub-Fehler' }, { status: 502 });
  }
}
