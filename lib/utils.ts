import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class names intelligently. Used by every UI primitive.
 *
 *   cn('px-2 py-1', condition && 'bg-black', className)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a REQUIRED, positive integer case pack; throws a user-facing error
 * otherwise. Money-critical: order quantity = cases × case_pack, so a 0 or
 * null silently under-bills every order for the SKU (the order forms fall
 * back to 1 unit per case). Backed by a DB CHECK constraint
 * (products_case_pack_positive).
 */
export function requirePositiveCasePack(raw: string | number | null | undefined): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Case pack is required and must be a positive whole number (order quantity = cases × case pack).');
  }
  return n;
}
