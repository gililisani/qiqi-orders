import { describe, it, expect } from 'vitest';
import { getClientIp, normalizeEmailForRateLimit } from '@/platform/rateLimit';
import { NextRequest } from 'next/server';

function makeRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost/test', { headers });
}

describe('getClientIp', () => {
  it('returns the first IP from x-forwarded-for', () => {
    const req = makeRequest({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' });
    expect(getClientIp(req)).toBe('203.0.113.5');
  });

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = makeRequest({ 'x-real-ip': '198.51.100.7' });
    expect(getClientIp(req)).toBe('198.51.100.7');
  });

  it('returns "unknown" when no IP headers are present', () => {
    const req = makeRequest({});
    expect(getClientIp(req)).toBe('unknown');
  });

  it('caps IP length so a giant header cannot bloat the rate-limit key', () => {
    const huge = 'a'.repeat(500);
    const req = makeRequest({ 'x-forwarded-for': huge });
    expect(getClientIp(req).length).toBeLessThanOrEqual(128);
  });
});

describe('normalizeEmailForRateLimit', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmailForRateLimit('  Foo@Bar.COM  ')).toBe('foo@bar.com');
  });

  it('caps length at 320', () => {
    const huge = 'a'.repeat(500) + '@example.com';
    expect(normalizeEmailForRateLimit(huge).length).toBeLessThanOrEqual(320);
  });

  it('handles null/undefined safely', () => {
    expect(normalizeEmailForRateLimit(null as any)).toBe('');
    expect(normalizeEmailForRateLimit(undefined as any)).toBe('');
  });
});
