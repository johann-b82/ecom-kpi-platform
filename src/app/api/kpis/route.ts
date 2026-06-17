import { NextResponse } from 'next/server';
import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';

const ALLOWED = new Set([7, 30, 90]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('days'));
  const days = ALLOWED.has(requested) ? requested : 30;

  const end = url.searchParams.get('end') ?? new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };

  const data = await loadDataset();
  const phases = computeKpis(data, range);
  return NextResponse.json({ range, phases });
}
