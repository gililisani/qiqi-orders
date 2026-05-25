import { describe, expect, it } from 'vitest';
import { normalizeNsDate } from '@/lib/netsuite';

describe('normalizeNsDate', () => {
  it('returns null for empty / null / whitespace', () => {
    expect(normalizeNsDate(null)).toBeNull();
    expect(normalizeNsDate(undefined)).toBeNull();
    expect(normalizeNsDate('')).toBeNull();
    expect(normalizeNsDate('   ')).toBeNull();
  });

  it('passes ISO through unchanged', () => {
    expect(normalizeNsDate('2026-04-29')).toBe('2026-04-29');
  });

  it('converts DD/MM/YYYY (Israeli/European format)', () => {
    expect(normalizeNsDate('29/04/2026')).toBe('2026-04-29');
    expect(normalizeNsDate('1/1/2026')).toBe('2026-01-01');
  });

  it('detects MM/DD/YYYY when day component > 12', () => {
    // 04/29/2026 — second component > 12, so first is the month
    expect(normalizeNsDate('04/29/2026')).toBe('2026-04-29');
  });

  it('handles dash separator', () => {
    expect(normalizeNsDate('29-04-2026')).toBe('2026-04-29');
  });

  it('returns null for unparseable garbage', () => {
    expect(normalizeNsDate('nope')).toBeNull();
    expect(normalizeNsDate('2026/04')).toBeNull();
    expect(normalizeNsDate('99/99/2026')).toBeNull();
  });
});
