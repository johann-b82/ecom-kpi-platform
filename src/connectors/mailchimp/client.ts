import type { MailchimpActivityDay, MailchimpActivityResponse } from './types';

// Mailchimp API keys carry their datacenter as a suffix ("<key>-us21"); the
// API host is derived from it (https://us21.api.mailchimp.com/3.0).
export function datacenterFromKey(apiKey: string): string {
  const idx = apiKey.lastIndexOf('-');
  const dc = idx >= 0 ? apiKey.slice(idx + 1) : '';
  if (!dc) {
    throw new Error('Mailchimp API key missing datacenter suffix (expected "<key>-usXX").');
  }
  return dc;
}

export class MailchimpClient {
  private readonly base: string;

  constructor(
    private readonly apiKey: string,
    private readonly listId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.base = `https://${datacenterFromKey(apiKey)}.api.mailchimp.com/3.0`;
  }

  private headers(): Record<string, string> {
    // Basic auth: any username, API key as password.
    const auth = Buffer.from(`anystring:${this.apiKey}`).toString('base64');
    return { Authorization: `Basic ${auth}`, accept: 'application/json' };
  }

  async listActivity(days: number): Promise<MailchimpActivityDay[]> {
    const url = `${this.base}/lists/${this.listId}/activity?count=${days}`;
    const res = await this.fetchImpl(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Mailchimp listActivity failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as MailchimpActivityResponse;
    return json.activity ?? [];
  }
}
