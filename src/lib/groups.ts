import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { APP_KEYS, APPS, type AppKey, type AppDef } from './apps';

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
  if (res.rows.length === 0) {
    // No memberships. Grandfather full admin ONLY when the system has no groups at all
    // (fresh install); otherwise the user simply has no access.
    const c = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM groups');
    return c.rows[0].n === 0 ? fullAdmin() : { apps: {}, isAdmin: false };
  }

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

export interface GroupAppAccess { app: AppKey; permission: Right }
export interface Group {
  id: string; name: string; isAdmin: boolean; memberIds: string[]; access: GroupAppAccess[];
}

export async function listGroups(): Promise<Group[]> {
  const groups = await pool.query<{ id: string; name: string; is_admin: boolean }>(
    'SELECT id, name, is_admin FROM groups ORDER BY name',
  );
  const members = await pool.query<{ group_id: string; user_id: string }>(
    'SELECT group_id, user_id FROM group_members',
  );
  const access = await pool.query<{ group_id: string; app: AppKey; permission: Right }>(
    'SELECT group_id, app, permission FROM group_app_access',
  );
  return groups.rows.map((g) => ({
    id: g.id,
    name: g.name,
    isAdmin: g.is_admin,
    memberIds: members.rows.filter((m) => m.group_id === g.id).map((m) => m.user_id),
    access: access.rows.filter((a) => a.group_id === g.id).map((a) => ({ app: a.app, permission: a.permission })),
  }));
}

export async function createGroup(name: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    'INSERT INTO groups (name) VALUES ($1) RETURNING id', [name],
  );
  return res.rows[0].id;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await pool.query('UPDATE groups SET name = $2 WHERE id = $1', [id, name]);
}

async function assertRemainingAdminGroup(excludeId: string): Promise<void> {
  const res = await pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM groups WHERE is_admin AND id <> $1', [excludeId],
  );
  if (res.rows[0].n === 0) throw new Error('Es muss mindestens eine Admin-Gruppe geben.');
}

export async function deleteGroup(id: string): Promise<void> {
  const res = await pool.query<{ is_admin: boolean }>('SELECT is_admin FROM groups WHERE id = $1', [id]);
  if (res.rows[0]?.is_admin) await assertRemainingAdminGroup(id);
  await pool.query('DELETE FROM groups WHERE id = $1', [id]);
}

export async function setAdmin(id: string, isAdmin: boolean): Promise<void> {
  if (!isAdmin) await assertRemainingAdminGroup(id);
  await pool.query('UPDATE groups SET is_admin = $2 WHERE id = $1', [id, isAdmin]);
}

export async function setAppAccess(id: string, app: AppKey, right: Right | null): Promise<void> {
  if (right === null) {
    await pool.query('DELETE FROM group_app_access WHERE group_id = $1 AND app = $2', [id, app]);
    return;
  }
  await pool.query(
    `INSERT INTO group_app_access (group_id, app, permission) VALUES ($1, $2, $3)
     ON CONFLICT (group_id, app) DO UPDATE SET permission = excluded.permission`,
    [id, app, right],
  );
}

export async function setMembers(id: string, userIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM group_members WHERE group_id = $1', [id]);
    for (const uid of userIds) {
      await client.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, uid],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function addUserToDefaultGroup(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO group_members (group_id, user_id)
       SELECT id, $1 FROM groups WHERE name = 'Alle Nutzer'
     ON CONFLICT DO NOTHING`,
    [userId],
  );
}

/** Apps to surface in the Rail/Launchpad. Hilfe is always shown (ungated baseline); others gated. */
export function accessibleApps(access: UserAccess): AppDef[] {
  return APPS.filter(
    (a) => a.key === 'hilfe' || access.isAdmin || !!access.apps[a.key],
  );
}
