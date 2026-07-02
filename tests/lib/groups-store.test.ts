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
    await setAppAccess(gid, 'brickpm', 'edit');
    await setAppAccess(gid, 'dashboard', 'view');
    await setMembers(gid, [U1, U2]);
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g.isAdmin).toBe(true);
    expect(g.memberIds.sort()).toEqual([U1, U2].sort());
    expect(g.access.find((a) => a.app === 'brickpm')?.permission).toBe('edit');
    expect(g.access.find((a) => a.app === 'dashboard')?.permission).toBe('view');
  });

  it('setAppAccess(null) removes; setMembers replaces; rename works', async () => {
    await setAppAccess(gid, 'dashboard', null);
    await setMembers(gid, [U1]);
    await renameGroup(gid, 'Umbenannt');
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g.name).toBe('Umbenannt');
    expect(g.memberIds).toEqual([U1]);
    expect(g.access.find((a) => a.app === 'dashboard')).toBeUndefined();
  });

  it('deleteGroup removes it (cascades members/access)', async () => {
    await deleteGroup(gid);
    expect((await listGroups()).find((x) => x.id === gid)).toBeUndefined();
    gid = '';
  });
});
