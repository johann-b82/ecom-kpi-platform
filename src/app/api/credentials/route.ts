import { NextResponse } from 'next/server';
import { listStatus, getCredential, setCredential, deleteCredential, isConfigured } from '@/lib/credentials';
import { CONNECTOR_FIELDS, CONNECTORS, CONNECTOR_LABELS, exclusiveSiblings, type Connector } from '@/lib/connector-fields';

export const dynamic = 'force-dynamic';

export async function GET() {
  const status = await listStatus();
  const fields = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const st = status.find((s) => s.connector === connector && s.field === f.field) ?? { isSet: false, updatedAt: undefined };
      const value = !f.secret && st.isSet ? (await getCredential(connector, f.field)) ?? undefined : undefined;
      fields.push({ connector, field: f.field, label: f.label, secret: f.secret, optional: f.optional, oauth: f.oauth, isSet: st.isSet, updatedAt: st.updatedAt, value });
    }
  }
  return NextResponse.json({ fields });
}

export async function POST(request: Request) {
  const body = (await request.json()) as { connector: Connector; fields: Record<string, string | null> };
  const known = new Set((CONNECTOR_FIELDS[body.connector] ?? []).map((f) => f.field));

  // Block configuring a connector while a mutually-exclusive sibling is set
  // (e.g. Shopware ⇄ WooCommerce share the orders/customers tables). Clearing
  // credentials (all null/empty) is always allowed so the user can switch.
  const isSettingValue = Object.entries(body.fields ?? {})
    .some(([field, value]) => known.has(field) && value !== null && value !== '');
  if (isSettingValue) {
    for (const sibling of exclusiveSiblings(body.connector)) {
      if (await isConfigured(sibling)) {
        return NextResponse.json(
          { ok: false, error: `${CONNECTOR_LABELS[sibling]} ist bereits konfiguriert. Bitte zuerst ${CONNECTOR_LABELS[sibling]} trennen, bevor ${CONNECTOR_LABELS[body.connector]} aktiviert wird.` },
          { status: 409 },
        );
      }
    }
  }

  for (const [field, value] of Object.entries(body.fields ?? {})) {
    if (!known.has(field)) continue;
    if (value === null) await deleteCredential(body.connector, field);
    else if (value !== '') await setCredential(body.connector, field, value);
  }
  return NextResponse.json({ ok: true });
}
