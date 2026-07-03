import { NextResponse } from 'next/server';
import { getSyncInterval, setSyncInterval, SYNC_INTERVALS, type SyncInterval } from '@/lib/settings';
import { listSyncState, runAll } from '@/lib/sync/runner';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [interval, state] = await Promise.all([getSyncInterval(), listSyncState()]);
  return NextResponse.json({ interval, state });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { action?: string; value?: string };
  if (body.action === 'interval') {
    if (!(SYNC_INTERVALS as string[]).includes(body.value ?? '')) {
      return NextResponse.json({ error: 'Ungültiges Intervall.' }, { status: 400 });
    }
    await setSyncInterval(body.value as SyncInterval);
    return NextResponse.json({ ok: true, interval: body.value });
  }
  if (body.action === 'now') {
    await runAll();
    return NextResponse.json({ ok: true, state: await listSyncState() });
  }
  return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
}
