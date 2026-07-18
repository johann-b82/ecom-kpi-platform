import { listStatus, getCredential } from '@/lib/credentials';
import { CONNECTOR_FIELDS, CONNECTORS } from '@/lib/connector-fields';
import { CredentialsForm, type FieldView } from '@/components/CredentialsForm';
import { BrandingForm } from '@/components/BrandingForm';
import { getBranding, getSyncInterval, getDemoAdsEnabled } from '@/lib/settings';
import { listSyncState } from '@/lib/sync/runner';
import { SyncForm } from '@/components/SyncForm';
import { UsersForm } from '@/components/UsersForm';
import { listUsers } from '@/lib/users';
import { createClient } from '@/lib/supabase/server';
import { listOAuthStatus } from '@/lib/oauth/status';
import { SetupShell } from '@/components/SetupShell';
import { getUserAccess, listGroups } from '@/lib/groups';
import { GroupsForm } from '@/components/GroupsForm';
import { AdminOnlyTag } from '@/components/AdminOnlyTag';
import { DemoAdsForm } from '@/components/DemoAdsForm';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const { data: { user: currentUser } } = await createClient().auth.getUser();
  const access = currentUser ? await getUserAccess(currentUser.id) : { apps: {}, isAdmin: false };
  if (!access.isAdmin) redirect('/');

  const branding = await getBranding();
  const users = await listUsers();
  const groups = await listGroups();
  const status = await listStatus();
  const oauth = await listOAuthStatus();
  const [syncInterval, syncState] = await Promise.all([getSyncInterval(), listSyncState()]);
  const demoAds = await getDemoAdsEnabled();
  const fields: FieldView[] = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const st = status.find((s) => s.connector === connector && s.field === f.field)
        ?? { isSet: false, updatedAt: null as string | null };
      const value = !f.secret && st.isSet ? (await getCredential(connector, f.field)) ?? undefined : undefined;
      fields.push({ connector, field: f.field, label: f.label, secret: f.secret, optional: f.optional, oauth: f.oauth, isSet: st.isSet, updatedAt: st.updatedAt, value });
    }
  }
  return (
    <SetupShell oauth={oauth}>
      <div className="space-y-10">
        <p className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          <AdminOnlyTag /> <span>Diese Seite ist nur für Administratoren sichtbar.</span>
        </p>
        <BrandingForm initial={branding} />
        <UsersForm users={users} currentUserId={currentUser?.id} />
        <GroupsForm groups={groups} users={users} />
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Verbindungen</h2>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Zugangsdaten werden AES-256-verschlüsselt in der DB gespeichert. Secrets werden in der Oberfläche maskiert und nie zurückgegeben — leer lassen heißt „unverändert".
          </p>
          <CredentialsForm fields={fields} oauth={oauth} />
        </div>
        <SyncForm interval={syncInterval} state={syncState} />
        <DemoAdsForm enabled={demoAds} />
      </div>
    </SetupShell>
  );
}
