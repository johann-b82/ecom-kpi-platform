import { listUsers } from '../src/lib/users';
import { addUserToDefaultGroup } from '../src/lib/groups';
import { pool } from '../src/lib/db';

async function main() {
  const users = await listUsers();
  for (const u of users) await addUserToDefaultGroup(u.id);
  console.log(`Backfilled ${users.length} users into 'Alle Nutzer'.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
