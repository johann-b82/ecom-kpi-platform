import { describe, it, expect } from 'vitest';
import { nextContactNumber } from '@/kontakte/number';

describe('nextContactNumber', () => {
  it('starts at K-0001 when empty', () => {
    expect(nextContactNumber([])).toBe('K-0001');
  });
  it('increments the max, ignoring malformed', () => {
    expect(nextContactNumber(['K-0001', 'K-0007', 'garbage'])).toBe('K-0008');
  });
  it('zero-pads to four digits', () => {
    expect(nextContactNumber(['K-0123'])).toBe('K-0124');
  });
});
