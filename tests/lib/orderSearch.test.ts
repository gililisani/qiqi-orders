import { describe, it, expect } from 'vitest';
import { buildOrderSearchOr, matchesSearch, parseSearchAmount, parseSearchDate, sanitizeSearchTerm } from '@/lib/orderSearch';

describe('order search', () => {
  it('identifiers with digits are NOT treated as amounts (the bug)', () => {
    for (const id of ['SOUS17468', 'A1JK6D', 'INVIL11004', 'CBS2026_055', 'PO6782']) {
      expect(parseSearchAmount(id)).toBeNull();
      const f = buildOrderSearchOr(id);
      expect(f).toContain(`po_number.ilike."%${id}%"`);
      expect(f).toContain(`so_number.ilike."%${id}%"`);
      expect(f).toContain(`invoice_number.ilike."%${id}%"`);
      expect(f).not.toContain('total_value');
    }
  });

  it('money-looking terms search identifiers AND the amount', () => {
    expect(parseSearchAmount('1704')).toBe(1704);
    expect(parseSearchAmount('$1,704.50')).toBe(1704.5);
    expect(parseSearchAmount('17,468')).toBe(17468);
    expect(parseSearchAmount('1,70')).toBeNull();
    const f = buildOrderSearchOr('10789');
    expect(f).toContain('so_number.ilike."%10789%"'); // SOIL10789 by its digits
    expect(f).toContain('and(total_value.gte.10788.99,total_value.lte.10789.01)');
  });

  it('dates only when the whole term is a date (US order for slashes)', () => {
    expect(parseSearchDate('2026-10-05')).toBe('2026-10-05');
    expect(parseSearchDate('10/5/2026')).toBe('2026-10-05');
    expect(parseSearchDate('10-05-2026')).toBe('2026-10-05');
    expect(parseSearchDate('PO-2026-10-05')).toBeNull();
    expect(parseSearchDate('SOUS17468')).toBeNull();
  });

  it('company matches are OR-ed in, never replace the identifier search', () => {
    const f = buildOrderSearchOr('beauty', ['c1', 'c2']);
    expect(f).toContain('company_id.in.(c1,c2)');
    expect(f).toContain('po_number.ilike."%beauty%"');
  });

  it('strips characters that would break the filter; empty → no filter', () => {
    expect(sanitizeSearchTerm(' A(1),"x"* ')).toBe('A 1 x');
    expect(buildOrderSearchOr('(),')).toBe('');
  });
});

describe('matchesSearch (rows that are not Hub orders)', () => {
  const row = { number: 'INVIL10927', date: '2026-03-05', total: 1704.5 };
  it('matches the document number, the day, or the amount', () => {
    expect(matchesSearch('', row)).toBe(true);
    expect(matchesSearch('il10927', row)).toBe(true);
    expect(matchesSearch('2026-03-05', row)).toBe(true);
    expect(matchesSearch('3/5/2026', row)).toBe(true);
    expect(matchesSearch('$1,704.50', row)).toBe(true);
    expect(matchesSearch('1704', row)).toBe(false);
    expect(matchesSearch('2026-03-06', row)).toBe(false);
    expect(matchesSearch('INVUS', row)).toBe(false);
  });
});
