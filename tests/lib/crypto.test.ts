import { describe, it, expect, beforeEach } from 'vitest';
import { encrypt, decrypt } from '@/lib/crypto';

const KEY = Buffer.alloc(32, 7).toString('base64');
beforeEach(() => { process.env.CREDENTIALS_KEY = KEY; });

describe('crypto (AES-256-GCM)', () => {
  it('round-trips a value', () => {
    expect(decrypt(encrypt('s3cret-value'))).toBe('s3cret-value');
  });
  it('produces different ciphertext each call (random IV)', () => {
    expect(encrypt('x')).not.toBe(encrypt('x'));
  });
  it('throws on tampered auth tag', () => {
    const [iv, , data] = encrypt('hello').split(':');
    const badTag = Buffer.alloc(16, 0).toString('base64');
    expect(() => decrypt(`${iv}:${badTag}:${data}`)).toThrow();
  });
  it('throws when CREDENTIALS_KEY is missing', () => {
    delete process.env.CREDENTIALS_KEY;
    expect(() => encrypt('x')).toThrow(/CREDENTIALS_KEY/);
  });
});
