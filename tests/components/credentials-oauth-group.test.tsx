import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

import { CredentialsForm, type FieldView } from '@/components/CredentialsForm';
import type { OAuthProviderStatus } from '@/lib/oauth/status';

afterEach(cleanup);

const oauth: OAuthProviderStatus[] = [
  { key: 'google', label: 'Google', connectors: ['ga4', 'google'], connected: false, hasAppCreds: false, accountLabel: null, scope: null, expiresAt: null },
];
const fields: FieldView[] = [
  { connector: 'google', field: 'GOOGLE_ADS_CLIENT_ID', label: 'OAuth Client ID', secret: false, optional: false, oauth: true, isSet: false, updatedAt: null },
  { connector: 'google', field: 'GOOGLE_ADS_DEVELOPER_TOKEN', label: 'Developer Token', secret: true, optional: false, isSet: false, updatedAt: null },
  { connector: 'ga4', field: 'GA4_PROPERTY_ID', label: 'Property ID', secret: false, optional: false, isSet: false, updatedAt: null },
];

describe('CredentialsForm OAuth grouping', () => {
  it('renders the OAuth fields under a clearly marked group heading, with the rest under "Weitere Felder"', () => {
    render(<CredentialsForm fields={fields} oauth={oauth} />);
    expect(screen.getByText(/OAuth-Zugangsdaten — für/)).toBeTruthy();
    expect(screen.getByText('Weitere Felder')).toBeTruthy();
  });

  it('tells GA4 that the Google OAuth credentials live under Google Ads', () => {
    render(<CredentialsForm fields={fields} oauth={oauth} />);
    expect(screen.getByText(/trägst du bei Google Ads ein/)).toBeTruthy();
  });
});
