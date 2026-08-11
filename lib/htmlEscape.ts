/**
 * Escape strings for safe insertion into HTML email bodies and quoted attributes.
 * Prevents HTML/script injection when interpolating DB or user-supplied text.
 */
export function escapeHtml(value: unknown): string {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize a value for use in an email header (Subject, etc.).
 *
 * Email headers are plain text, NOT HTML — escapeHtml is the wrong tool
 * here, it would turn "O'Hara & Sons" into "O&#39;Hara &amp; Sons" in the
 * inbox subject line. The real safety concern for headers is RFC 5322
 * CR/LF injection (header smuggling), so strip those characters and trim.
 */
export function sanitizeEmailHeader(value: unknown): string {
  if (value == null) return '';
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Sanitize a filename for a Content-Disposition response header.
 *
 * Same CR/LF injection concern as email headers, plus quotes/backslashes
 * would escape the quoted-string and let a crafted name smuggle header
 * text. The name may come from an external system (e.g. NetSuite's tranid),
 * so allow only a conservative charset and fall back when nothing survives.
 */
export function sanitizeContentDispositionFilename(value: unknown, fallback = 'file.pdf'): string {
  if (value == null) return fallback;
  const cleaned = String(value)
    .replace(/[^\w.\- ()]/g, '')
    .trim();
  return cleaned || fallback;
}
