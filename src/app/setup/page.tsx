import Link from 'next/link';
import { listStatus, getCredential } from '@/lib/credentials';
import { CONNECTOR_FIELDS, CONNECTORS } from '@/lib/connector-fields';
import { CredentialsForm, type FieldView } from '@/components/CredentialsForm';
import { BrandingForm } from '@/components/BrandingForm';
import { getBranding } from '@/lib/settings';
import { UsersForm } from '@/components/UsersForm';
import { listUsers } from '@/lib/users';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const branding = await getBranding();
  const users = await listUsers();
  const { data: { user: currentUser } } = await createClient().auth.getUser();
  const status = await listStatus();
  const fields: FieldView[] = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const st = status.find((s) => s.connector === connector && s.field === f.field)
        ?? { isSet: false, updatedAt: null as string | null };
      const value = !f.secret && st.isSet ? (await getCredential(connector, f.field)) ?? undefined : undefined;
      fields.push({ connector, field: f.field, label: f.label, secret: f.secret, optional: f.optional, isSet: st.isSet, updatedAt: st.updatedAt, value });
    }
  }
  return (
    <main className="mx-auto max-w-3xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">⚙ Einstellungen</h1>
        <Link href="/" className="text-sm text-brand hover:text-brand-dark">← Zum Dashboard</Link>
      </header>
      <div className="space-y-10">
        <BrandingForm initial={branding} />
        <UsersForm users={users} currentUserId={currentUser?.id} />
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Verbindungen</h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Zugangsdaten werden AES-256-verschlüsselt in der DB gespeichert. Secrets werden in der Oberfläche maskiert und nie zurückgegeben — leer lassen heißt „unverändert".
          </p>
          <CredentialsForm fields={fields} />
        </div>
      </div>
    </main>
  );
}
