import { afterEach, describe, expect, it } from 'vitest';
import { formatDate } from '@/lib/formatters';

describe('formatDate', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  it('a bare calendar date is the same day in every timezone', () => {
    for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Jerusalem', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      expect(formatDate('2023-01-01')).toBe('Jan 1, 2023');
    }
  });

  it('timestamps still render in local time; empty stays empty', () => {
    process.env.TZ = 'UTC';
    expect(formatDate('2026-08-04T14:35:00Z')).toBe('Aug 4, 2026');
    expect(formatDate(null)).toBe('');
  });
});
