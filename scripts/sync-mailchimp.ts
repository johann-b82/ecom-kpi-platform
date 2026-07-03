import { MailchimpClient } from '../src/connectors/mailchimp/client';
import { normalizeActivity } from '../src/connectors/mailchimp/connector';
import { writeMailchimpSubscribers } from '../src/connectors/mailchimp/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const cfg = await loadConnectorConfig('mailchimp');
  const days = parseDays(process.argv);

  const client = new MailchimpClient(cfg.MAILCHIMP_API_KEY, cfg.MAILCHIMP_LIST_ID);
  console.log(`Fetching Mailchimp list activity (last ${days} days)…`);
  const activity = await client.listActivity(days);

  const data = normalizeActivity(activity);
  console.log(`Normalized → ${data.subscribers.length} subscriber day-rows (source=mailchimp).`);

  await writeMailchimpSubscribers(data);
  console.log('Wrote mailchimp subscribers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
