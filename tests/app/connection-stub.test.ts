import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/lib/integrations', () => ({ simulateConnect: vi.fn(), listConnections: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { simulateConnectAction } from '@/app/(shell)/kontakte/actions';
import { requireAppAccess } from '@/lib/groups';
import { simulateConnect } from '@/lib/integrations';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

it('simulateConnectAction gates on edit, connects, revalidates', async () => {
  vi.mocked(requireAppAccess).mockResolvedValue(undefined);
  await simulateConnectAction('x1');
  expect(requireAppAccess).toHaveBeenCalledWith('kontakte', 'edit');
  expect(simulateConnect).toHaveBeenCalledWith('x1');
  expect(revalidatePath).toHaveBeenCalledWith('/kontakte/einstellungen/verbindungen');
});
