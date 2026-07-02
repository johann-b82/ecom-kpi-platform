import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { OAuthProviderStatus } from '@/lib/oauth/status';

afterEach(cleanup);

const oauth: OAuthProviderStatus[] = [
  { key: 'google', label: 'Google', connectors: ['ga4', 'google'], connected: true, hasAppCreds: true, accountLabel: 'Acme', scope: null, expiresAt: null },
  { key: 'meta', label: 'Meta', connectors: ['meta'], connected: false, hasAppCreds: false, accountLabel: null, scope: null, expiresAt: null },
  { key: 'tiktok', label: 'TikTok', connectors: ['tiktok'], connected: false, hasAppCreds: false, accountLabel: null, scope: null, expiresAt: null },
];

describe('SetupGuide', () => {
  it('renders one tab per provider and shows the connected state for the default tab', async () => {
    const { SetupGuide } = await import('@/components/SetupGuide');
    render(<SetupGuide oauth={oauth} />);
    expect(screen.getByRole('tab', { name: 'Google' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Meta' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'TikTok' })).toBeTruthy();
    // Google is default + connected.
    expect(screen.getByText(/Verbunden/)).toBeTruthy();
    expect(screen.getByText('Zugang bei Google anlegen')).toBeTruthy();
  });

  it('switches provider content when another tab is clicked', async () => {
    const { SetupGuide } = await import('@/components/SetupGuide');
    render(<SetupGuide oauth={oauth} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Meta' }));
    expect(screen.getByText('Zugang bei Meta anlegen')).toBeTruthy();
    // Meta's first step is current → its body (with the Meta-specific hint) is expanded.
    expect(screen.getByText(/Meta for Developers/)).toBeTruthy();
    // Google's step is no longer shown.
    expect(screen.queryByText('Zugang bei Google anlegen')).toBeNull();
  });
});
