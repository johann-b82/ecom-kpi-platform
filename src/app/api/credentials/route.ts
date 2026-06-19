import { NextResponse } from 'next/server';
import { listStatus, getCredential, setCredential, deleteCredential } from '@/lib/credentials';
import { CONNECTOR_FIELDS, CONNECTORS, type Connector } from '@/lib/connector-fields';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await listStatus();
  const fields = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const st = status.find((s) => s.connector === connector && s.field === f.field) ?? { isSet: false, updatedAt: undefined };
      const value = !f.secret && st.isSet ? (await getCredential(connector, f.field)) ?? undefined : undefined;
      fields.push({ connector, field: f.field, label: f.label, secret: f.secret, optional: f.optional, isSet: st.isSet, updatedAt: st.updatedAt, value });
    }
  }
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { connector: Connector; fields: Record<string, string | null> };
  const known = new Set((CONNECTOR_FIELDS[body.connector] ?? []).map((f) => f.field));
  for (const [field, value] of Object.entries(body.fields ?? {})) {
    if (!known.has(field)) continue;
    if (value === null) await deleteCredential(body.connector, field);
    else if (value !== '') await setCredential(body.connector, field, value);
  }
  return NextResponse.json({ ok: true });
}
