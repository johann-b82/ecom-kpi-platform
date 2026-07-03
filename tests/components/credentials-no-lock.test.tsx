import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

import { CredentialsForm, type FieldView } from '@/components/CredentialsForm';

afterEach(cleanup);

// Shopware configured (isSet) → WooCommerce must be locked.
const fields: FieldView[] = [
  { connector: 'shopware', field: 'SHOPWARE_API_URL', label: 'API URL', secret: false, optional: false, isSet: true, updatedAt: '2026-01-01' },
  { connector: 'woocommerce', field: 'WOOCOMMERCE_STORE_URL', label: 'Store URL', secret: false, optional: false, isSet: false, updatedAt: null },
  { connector: 'woocommerce', field: 'WOOCOMMERCE_CONSUMER_KEY', label: 'Consumer Key', secret: true, optional: false, isSet: false, updatedAt: null },
];

describe('CredentialsForm exclusive lock', () => {
  it('sperrt WooCommerce, während Shopware konfiguriert ist', () => {
    const { container } = render(<CredentialsForm fields={fields} />);
    expect(screen.getByText(/Gesperrt: Shopware ist aktiv/)).toBeTruthy();
    // The locked connector's Speichern button is disabled; Shopware stays editable.
    const [shopwareBtn, wooBtn] = screen.getAllByRole('button', { name: 'Speichern' }) as HTMLButtonElement[];
    expect(shopwareBtn.disabled).toBe(false);
    expect(wooBtn.disabled).toBe(true);
    // WooCommerce's own input fields are disabled.
    const disabledInputs = container.querySelectorAll('input:disabled');
    expect(disabledInputs.length).toBe(2); // store url + consumer key
  });

  it('sperrt nichts, wenn kein Geschwister gesetzt ist', () => {
    const none = fields.map((f) => ({ ...f, isSet: false }));
    render(<CredentialsForm fields={none} />);
    expect(screen.queryByText(/Gesperrt:/)).toBeNull();
    const buttons = screen.getAllByRole('button', { name: 'Speichern' }) as HTMLButtonElement[];
    expect(buttons.every((b) => !b.disabled)).toBe(true);
  });
});
