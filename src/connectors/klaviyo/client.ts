import { addDays } from '@/lib/dates';
import type { KlaviyoAggregateAttributes, KlaviyoMetric } from './types';

const BASE = 'https://a.klaviyo.com';
const REVISION = '2024-10-15';

export class KlaviyoClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Klaviyo-API-Key ${this.apiKey}`,
      revision: REVISION,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  async listMetrics(): Promise<KlaviyoMetric[]> {
    const res = await this.fetchImpl(`${BASE}/api/metrics`, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Klaviyo listMetrics failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { id: string; attributes: { name: string } }[] };
    return json.data.map((m) => ({ id: m.id, name: m.attributes.name }));
  }

  async resolveMetricId(name: string): Promise<string> {
    const metrics = await this.listMetrics();
    const found = metrics.find((m) => m.name === name);
    if (!found) {
      const available = metrics.map((m) => m.name).join(', ');
      throw new Error(`Klaviyo metric "${name}" not found. Available: ${available}`);
    }
    return found.id;
  }

  async metricAggregate(metricId: string, days: number): Promise<KlaviyoAggregateAttributes> {
    // Berlin calendar date (matches the aggregate timezone), not UTC.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    const start = addDays(today, -(days - 1));
    const endExclusive = addDays(today, 1);
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: ['count'],
          interval: 'day',
          timezone: 'Europe/Berlin',
          filter: [
            `greater-or-equal(datetime,${start}T00:00:00)`,
            `less-than(datetime,${endExclusive}T00:00:00)`,
          ],
          page_size: 500,
        },
      },
    };
    const res = await this.fetchImpl(`${BASE}/api/metric-aggregates`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Klaviyo metricAggregate failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { attributes: KlaviyoAggregateAttributes } };
    return json.data.attributes;
  }
}
