import { createClient } from '@supabase/supabase-js';

// Server-only Supabase admin client (service-role key). Never import into client code.
function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export interface AppUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
}

export async function listUsers(): Promise<AppUser[]> {
  const { data, error } = await admin().auth.admin.listUsers();
  if (error) throw new Error(error.message);
  return data.users
    .map((u) => ({ id: u.id, email: u.email ?? '', createdAt: u.created_at, lastSignInAt: u.last_sign_in_at ?? null }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function createUser(email: string, password: string): Promise<void> {
  const { error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string): Promise<void> {
  const { error } = await admin().auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}

export async function updateUserPassword(id: string, password: string): Promise<void> {
  const { error } = await admin().auth.admin.updateUserById(id, { password });
  if (error) throw new Error(error.message);
}
