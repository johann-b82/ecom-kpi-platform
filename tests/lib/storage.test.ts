import { describe, it, expect, vi, afterEach } from 'vitest';

const from = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ storage: { from, getBucket: vi.fn(async () => ({ error: null })) } }),
}));

import { uploadFile } from '@/lib/storage';

afterEach(() => { vi.clearAllMocks(); });

describe('uploadFile', () => {
  it('returns the public URL on success', async () => {
    from.mockReturnValue({
      upload: vi.fn(async () => ({ error: null })),
      getPublicUrl: () => ({ data: { publicUrl: 'https://s/katalog/x.png' } }),
    });
    const url = await uploadFile('katalog/x.png', new File(['x'], 'x.png'));
    expect(url).toBe('https://s/katalog/x.png');
  });

  it('returns null when the upload errors (caller falls back to URL paste)', async () => {
    from.mockReturnValue({
      upload: vi.fn(async () => ({ error: { message: 'no bucket' } })),
      getPublicUrl: () => ({ data: { publicUrl: '' } }),
    });
    expect(await uploadFile('katalog/x.png', new File(['x'], 'x.png'))).toBeNull();
  });
});
