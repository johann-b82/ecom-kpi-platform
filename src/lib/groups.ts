import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { APP_KEYS, type AppKey } from './apps';

export type Right = 'view' | 'edit';

export interface UserAccess {
  apps: Partial<Record<AppKey, Right>>;
  isAdmin: boolean;
}

function fullAdmin(): UserAccess {
  const apps: Partial<Record<AppKey, Right>> = {};
  for (const k of APP_KEYS) apps[k] = 'edit';
  return { apps, isAdmin: true };
}

interface AccessRow { is_admin: boolean; app: AppKey | null; permission: Right | null }

export async function getUserAccess(userId: string): Promise<UserAccess> {
  const res = await pool.query<AccessRow>(
    `SELECT g.is_admin, a.app, a.permission
       FROM group_members m
       JOIN groups g ON g.id = m.group_id
       LEFT JOIN group_app_access a ON a.group_id = g.id
      WHERE m.user_id = $1`,
    [userId],
  );
  if (res.rows.length === 0) return fullAdmin(); // grandfather: no memberships → full admin

  const apps: Partial<Record<AppKey, Right>> = {};
  let isAdmin = false;
  for (const row of res.rows) {
    if (row.is_admin) isAdmin = true;
    if (row.app && row.permission) {
      // edit beats view
      if (apps[row.app] !== 'edit') apps[row.app] = row.permission;
    }
  }
  return { apps, isAdmin };
}

export async function requireAppAccess(app: AppKey, right: Right = 'view'): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error('Nicht angemeldet.');
  const access = await getUserAccess(user.id);
  const have = access.apps[app];
  if (!have || (right === 'edit' && have !== 'edit')) {
    throw new Error(`Kein Zugriff auf ${app}.`);
  }
}
