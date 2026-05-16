import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@/lib/htmlEscape';

describe('escapeHtml', () => {
  it('escapes all five HTML metacharacters', () => {
    expect(escapeHtml('<script>alert("x")</script>'))
      .toBe('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('escapes ampersand first so other escapes are not double-encoded', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("Bob's")).toBe('Bob&#39;s');
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('coerces non-string values to strings', () => {
    expect(escapeHtml(42)).toBe('42');
    expect(escapeHtml(true)).toBe('true');
  });

  it('blocks the feedback-form injection vector', () => {
    // Reproduces the original CRITICAL finding: user name embedded in
    // email subject/body without escaping. The `onerror` substring
    // remains as plain text in the output — what matters is that the
    // `<` and `"` chars are encoded, so the browser/mail client never
    // parses the string as a tag.
    const malicious = '"><img src=x onerror=alert(1)>';
    const escaped = escapeHtml(malicious);
    expect(escaped).not.toMatch(/<img/);
    expect(escaped).not.toMatch(/<\//);
    expect(escaped).toContain('&lt;img');
    expect(escaped).toContain('&quot;');
  });
});
