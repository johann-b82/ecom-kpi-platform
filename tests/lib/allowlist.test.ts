import { describe, it, expect } from 'vitest';
import { isAllowedEmail } from '@/lib/allowlist';

const list = 'Johann.Bechtold@gmail.com, ops@mocafe.de';

describe('isAllowedEmail', () => {
  it('erlaubt gelistete Adressen case-insensitive und getrimmt', () => {
    expect(isAllowedEmail('johann.bechtold@gmail.com', list)).toBe(true);
    expect(isAllowedEmail('  OPS@MOCAFE.DE  ', list)).toBe(true);
  });
  it('lehnt nicht gelistete Adressen ab', () => {
    expect(isAllowedEmail('intruder@evil.com', list)).toBe(false);
  });
  it('fail-closed: leere oder fehlende Allowlist → false', () => {
    expect(isAllowedEmail('johann.bechtold@gmail.com', '')).toBe(false);
    expect(isAllowedEmail('johann.bechtold@gmail.com', undefined)).toBe(false);
    expect(isAllowedEmail('johann.bechtold@gmail.com', '   ')).toBe(false);
  });
  it('fehlende E-Mail → false', () => {
    expect(isAllowedEmail(undefined, list)).toBe(false);
    expect(isAllowedEmail(null, list)).toBe(false);
  });
});
