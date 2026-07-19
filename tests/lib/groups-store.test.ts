import { describe, it, expect, afterAll } from 'vitest';
import {
  createGroup, listGroups, renameGroup, setAdmin, setAppAccess, setMembers, deleteGroup,
} from '@/lib/groups';
import { pool } from '@/lib/db';

const U1 = '00000000-0000-0000-0000-000000000001';
const U2 = '00000000-0000-0000-0000-000000000002';
let gid = '';

afterAll(async () => {
  if (gid) await pool.query('DELETE FROM groups WHERE id = $1', [gid]);
  await pool.end();
});

describe('group store (integration, benötigt DB)', () => {
  it('create → list round-trip', async () => {
    gid = await createGroup('Testgruppe');
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g).toMatchObject({ name: 'Testgruppe', isAdmin: false, memberIds: [], access: [] });
  });

  it('setAdmin / setAppAccess / setMembers reflected in listGroups', async () => {
    await setAdmin(gid, true);
    await setAppAccess(gid, 'katalog', 'edit');
    await setAppAccess(gid, 'kontakte', 'view');
    await setMembers(gid, [U1, U2]);
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g.isAdmin).toBe(true);
    expect(g.memberIds.sort()).toEqual([U1, U2].sort());
    expect(g.access.find((a) => a.app === 'katalog')?.permission).toBe('edit');
    expect(g.access.find((a) => a.app === 'kontakte')?.permission).toBe('view');
  });

  it('setAppAccess(null) removes; setMembers replaces; rename works', async () => {
    await setAppAccess(gid, 'kontakte', null);
    await setMembers(gid, [U1]);
    await renameGroup(gid, 'Umbenannt');
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g.name).toBe('Umbenannt');
    expect(g.memberIds).toEqual([U1]);
    expect(g.access.find((a) => a.app === 'kontakte')).toBeUndefined();
  });

  it('deleteGroup removes it (cascades members/access)', async () => {
    await deleteGroup(gid);
    expect((await listGroups()).find((x) => x.id === gid)).toBeUndefined();
    gid = '';
  });
});

describe('last-admin-group guard (integration, benötigt DB)', () => {
  let adminGid = '';

  afterAll(async () => {
    if (adminGid) await pool.query('DELETE FROM groups WHERE id = $1', [adminGid]);
  });

  it('setAdmin(id, false) succeeds when another admin group remains (e.g. the seeded "Alle Nutzer")', async () => {
    adminGid = await createGroup('Testgruppe Admin A');
    await setAdmin(adminGid, true);
    await expect(setAdmin(adminGid, false)).resolves.toBeUndefined();
    const g = (await listGroups()).find((x) => x.id === adminGid)!;
    expect(g.isAdmin).toBe(false);
  });

  it('setAdmin(id, false) rejects when it would remove the last admin group', async () => {
    const adminGroups = (await listGroups()).filter((g) => g.isAdmin);
    expect(adminGroups.length).toBeGreaterThanOrEqual(1);
    if (adminGroups.length !== 1) return; // only exercise the reject path when it is unambiguous
    const lastAdmin = adminGroups[0];
    await expect(setAdmin(lastAdmin.id, false)).rejects.toThrow(/mindestens eine Admin-Gruppe/);
    const after = (await listGroups()).find((x) => x.id === lastAdmin.id)!;
    expect(after.isAdmin).toBe(true); // unchanged
  });

  it('deleteGroup rejects deleting the last admin group, but succeeds for a non-admin group', async () => {
    const nonAdminGid = await createGroup('Testgruppe Non-Admin');
    await expect(deleteGroup(nonAdminGid)).resolves.toBeUndefined();
    expect((await listGroups()).find((x) => x.id === nonAdminGid)).toBeUndefined();

    const adminGroups = (await listGroups()).filter((g) => g.isAdmin);
    if (adminGroups.length !== 1) return; // only exercise the reject path when it is unambiguous
    const lastAdmin = adminGroups[0];
    await expect(deleteGroup(lastAdmin.id)).rejects.toThrow(/mindestens eine Admin-Gruppe/);
    expect((await listGroups()).find((x) => x.id === lastAdmin.id)).toBeDefined();
  });
});
