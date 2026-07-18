import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/verfuegbarkeit/repository', () => ({
  adjustStock: vi.fn(),
  createDraftPurchaseOrder: vi.fn(async () => 'po-1'),
  markPurchaseOrderOrdered: vi.fn(),
  receiveGoods: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
}));

import {
  adjustStockAction, createDraftPurchaseOrderAction, receiveGoodsAction, cancelPurchaseOrderAction,
} from '@/app/(shell)/verfuegbarkeit/actions';
import { requireAppAccess } from '@/lib/groups';
import * as repo from '@/verfuegbarkeit/repository';

beforeEach(() => { vi.clearAllMocks(); });

describe('verfuegbarkeit actions', () => {
  it('adjustStockAction gated auf verfuegbarkeit/edit und ruft Repo', async () => {
    await adjustStockAction('v1', 'w1', -2, 'bruch_schwund', 'x');
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
    expect(repo.adjustStock).toHaveBeenCalledWith('v1', 'w1', -2, 'bruch_schwund', 'x');
  });
  it('createDraftPurchaseOrderAction gibt die neue PO-Id zurück', async () => {
    const id = await createDraftPurchaseOrderAction({ supplierId: 's1', lines: [{ variantId: 'v1', quantityOrdered: 5 }] });
    expect(id).toBe('po-1');
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
    expect(repo.createDraftPurchaseOrder).toHaveBeenCalledWith({ supplierId: 's1', lines: [{ variantId: 'v1', quantityOrdered: 5 }] });
  });
  it('receiveGoodsAction reicht die receipts durch', async () => {
    await receiveGoodsAction('po1', [{ lineId: 'l1', quantity: 3 }]);
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
    expect(repo.receiveGoods).toHaveBeenCalledWith('po1', [{ lineId: 'l1', quantity: 3 }]);
  });
  it('cancelPurchaseOrderAction ist gated', async () => {
    await cancelPurchaseOrderAction('po1');
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
    expect(repo.cancelPurchaseOrder).toHaveBeenCalledWith('po1');
  });
});
