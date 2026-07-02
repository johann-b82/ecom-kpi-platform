import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getUserAccess, listGroups, createGroup, renameGroup, deleteGroup,
  setAdmin, setAppAccess, setMembers,
} from '@/lib/groups';
import { listUsers } from '@/lib/users';
import type { AppKey } from '@/lib/apps';
import type { Right } from '@/lib/groups';

export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<NextResponse | null> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access.isAdmin) return NextResponse.json({ error: 'Nur Admins dürfen Gruppen verwalten.' }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const [groups, users] = await Promise.all([listGroups(), listUsers()]);
  return NextResponse.json({ groups, users });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json()) as {
    action: string; id?: string; name?: string; isAdmin?: boolean;
    app?: AppKey; right?: Right | null; userIds?: string[];
  };
  try {
    switch (body.action) {
      case 'create': await createGroup(body.name ?? ''); break;
      case 'rename': await renameGroup(body.id!, body.name ?? ''); break;
      case 'delete': await deleteGroup(body.id!); break;
      case 'setAdmin': await setAdmin(body.id!, !!body.isAdmin); break;
      case 'setAppAccess': await setAppAccess(body.id!, body.app!, body.right ?? null); break;
      case 'setMembers': await setMembers(body.id!, body.userIds ?? []); break;
      default: return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
