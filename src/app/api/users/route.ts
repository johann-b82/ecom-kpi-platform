import { NextResponse } from 'next/server';
import { listUsers, createUser, deleteUser, updateUserPassword } from '@/lib/users';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ users: await listUsers() });
}

export async function POST(request: Request) {
  const { email, password } = (await request.json()) as { email?: string; password?: string };
  if (!email || !password || password.length < 6) {
    return NextResponse.json({ error: 'E-Mail und Passwort (min. 6 Zeichen) erforderlich.' }, { status: 400 });
  }
  await createUser(email, password);
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request) {
  const { id, password } = (await request.json()) as { id?: string; password?: string };
  if (!id || !password || password.length < 6) {
    return NextResponse.json({ error: 'Passwort (min. 6 Zeichen) erforderlich.' }, { status: 400 });
  }
  await updateUserPassword(id, password);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { id } = (await request.json()) as { id?: string };
  if (!id) return NextResponse.json({ error: 'id fehlt.' }, { status: 400 });
  // Prevent self-lockout: a user cannot delete their own account.
  const { data: { user } } = await createClient().auth.getUser();
  if (user?.id === id) {
    return NextResponse.json({ error: 'Du kannst dein eigenes Konto nicht löschen.' }, { status: 400 });
  }
  await deleteUser(id);
  return NextResponse.json({ ok: true });
}
