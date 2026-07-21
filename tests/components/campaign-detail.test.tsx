import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CampaignDetail } from '@/components/CampaignDetail';
import { campaignKpis, type CampaignSummary } from '@/kpi/campaigns';

afterEach(cleanup);

const summary: CampaignSummary = {
  id: 'm-retargeting', name: 'Retargeting_DPA', platform: 'meta_ads', stage: 'do',
  spend: 1200, impressions: 50000, clicks: 800, firstDate: '2026-01-01', lastDate: '2026-01-31',
};

describe('CampaignDetail', () => {
  it('zeigt Name, Stage, Spend, ROAS und den Attributions-Hinweis', () => {
    const rows = [{ date: '2026-01-10', platform: 'meta_ads' as const, spend: 1200,
      impressions: 50000, clicks: 800, conversions: 40, convValue: 3600,
      campaignId: 'm-retargeting', campaignName: 'Retargeting_DPA' }];
    render(<CampaignDetail summary={summary} kpis={campaignKpis(rows, 'do')} />);
    expect(screen.getByText('Retargeting_DPA')).toBeTruthy();
    expect(screen.getByText('DO')).toBeTruthy();
    expect(screen.getByText('ROAS')).toBeTruthy();
    expect(screen.getByText(/nicht kampagnen-attribuiert/)).toBeTruthy();
  });
});
