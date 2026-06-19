import { createClient } from '@supabase/supabase-js';

export async function createInitialUser(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.LOCAL_USER_EMAIL;
  const password = process.env.LOCAL_USER_PASSWORD;
  if (!url || !key || !email || !password) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOCAL_USER_EMAIL, LOCAL_USER_PASSWORD required.');
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      console.log('User already exists — ok.');
      return;
    }
    throw error;
  }
  console.log('Created user', email);
}

// Run when invoked directly (tsx scripts/create-user.ts), not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('create-user.ts')) {
  createInitialUser().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
