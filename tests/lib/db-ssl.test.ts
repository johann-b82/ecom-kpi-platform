import { describe, it, expect } from 'vitest';
import { poolSsl } from '@/lib/db';

describe('poolSsl', () => {
  it('returns false when DATABASE_SSL is unset', () => {
    expect(poolSsl(undefined)).toBe(false);
  });
  it('returns rejectUnauthorized:false when DATABASE_SSL=require', () => {
    expect(poolSsl('require')).toEqual({ rejectUnauthorized: false });
  });
});
