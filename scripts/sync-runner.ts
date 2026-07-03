import { runDue } from '../src/lib/sync/runner';
import { pool } from '../src/lib/db';

// Invoked by the hourly cron; runs connectors whose configured interval has elapsed.
runDue()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
