import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

import { CredentialsForm, type FieldView } from '@/components/CredentialsForm';

afterEach(cleanup);

// Shopware configured (isSet) — WooCommerce must stay editable regardless.
const fields: FieldView[] = [
  { connector: 'shopware', field: 'SHOPWARE_API_URL', label: 'API URL', secret: false, optional: false, isSet: true, updatedAt: '2026-01-01' },
  { connector: 'woocommerce', field: 'WOOCOMMERCE_STORE_URL', label: 'Store URL', secret: false, optional: false, isSet: false, updatedAt: null },
  { connector: 'woocommerce', field: 'WOOCOMMERCE_CONSUMER_KEY', label: 'Consumer Key', secret: true, optional: false, isSet: false, updatedAt: null },
];

describe('CredentialsForm ohne Exklusiv-Sperre', () => {
  it('sperrt WooCommerce nicht, während Shopware konfiguriert ist', () => {
    const { container } = render(<CredentialsForm fields={fields} />);
    expect(screen.queryByText(/Gesperrt/)).toBeNull();
    const buttons = screen.getAllByRole('button', { name: 'Speichern' }) as HTMLButtonElement[];
    expect(buttons.every((b) => !b.disabled)).toBe(true);
    expect(container.querySelectorAll('input:disabled').length).toBe(0);
  });
});
