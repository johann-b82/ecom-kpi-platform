import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const saveVariantAction = vi.fn(async (_v: unknown) => {});
vi.mock('@/app/(shell)/katalog/actions', () => ({ saveVariantAction, removeVariantAction: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const variants = [{ id: 'v1', productId: 'p1', sku: 'SKU-1', gtin: null, attributes: null,
  purchasePrice: '4.50', weightG: null, reorderPoint: 5, customsTariffNo: null, status: 'aktiv' }];

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe('VariantTable', () => {
  it('saves an edited SKU on blur', async () => {
    const { VariantTable } = await import('@/components/VariantTable');
    render(<VariantTable productId="p1" variants={variants as never} />);
    const input = screen.getByDisplayValue('SKU-1');
    fireEvent.change(input, { target: { value: 'SKU-2' } });
    fireEvent.blur(input);
    expect(saveVariantAction).toHaveBeenCalled();
    expect(saveVariantAction.mock.calls[0][0]).toMatchObject({ id: 'v1', sku: 'SKU-2' });
  });

  it('does not save when unchanged', async () => {
    const { VariantTable } = await import('@/components/VariantTable');
    render(<VariantTable productId="p1" variants={variants as never} />);
    const input = screen.getByDisplayValue('SKU-1');
    fireEvent.blur(input);
    expect(saveVariantAction).not.toHaveBeenCalled();
  });
});
