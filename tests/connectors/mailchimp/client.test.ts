import { describe, it, expect, vi } from 'vitest';
import { MailchimpClient, datacenterFromKey } from '@/connectors/mailchimp/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const activityBody = {
  list_id: 'L1',
  total_items: 2,
  activity: [
    { day: '2026-01-01', subs: 5, unsubs: 1 },
    { day: '2026-01-02', subs: 8, unsubs: 0 },
  ],
};

describe('datacenterFromKey', () => {
  it('leitet den Datacenter aus dem Key-Suffix ab', () => {
    expect(datacenterFromKey('abc123-us21')).toBe('us21');
  });
  it('wirft, wenn der Suffix fehlt', () => {
    expect(() => datacenterFromKey('abc123')).toThrow(/datacenter suffix/i);
  });
});

describe('MailchimpClient', () => {
  it('ruft die List-Activity mit Basic-Auth und count auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(activityBody));
    const client = new MailchimpClient('KEY-us21', 'L1', fetchMock as unknown as typeof fetch);
    const activity = await client.listActivity(180);
    expect(activity).toEqual(activityBody.activity);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://us21.api.mailchimp.com/3.0/lists/L1/activity?count=180');
    const auth = (init as RequestInit).headers as Record<string, string>;
    expect(auth.Authorization).toBe(`Basic ${Buffer.from('anystring:KEY-us21').toString('base64')}`);
  });

  it('gibt [] zurück, wenn activity fehlt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ list_id: 'L1', total_items: 0 }));
    const client = new MailchimpClient('KEY-us21', 'L1', fetchMock as unknown as typeof fetch);
    expect(await client.listActivity(30)).toEqual([]);
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ detail: 'nope' }, 401));
    const client = new MailchimpClient('KEY-us21', 'L1', fetchMock as unknown as typeof fetch);
    await expect(client.listActivity(30)).rejects.toThrow(/listActivity failed: 401/);
  });
});
