/**
 * Validates a signer signature image value.
 * Accepted: empty (no image), a seeded app-relative path under /templates/,
 * or an uploaded image as a base64 data: URL (~2MB cap ≈ 1.5MB image).
 * Returns an error message, or null if valid.
 */
export function validateSignature(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return 'Invalid signature image.';
  if (value.startsWith('/templates/')) return null;
  if (!/^data:image\/(png|jpeg|gif|webp);base64,/.test(value)) {
    return 'Signature must be an uploaded image (PNG, JPEG, GIF, or WebP).';
  }
  if (value.length > 2_000_000) return 'Signature image is too large (max ~1.5MB).';
  return null;
}
