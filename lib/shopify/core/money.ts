/**
 * All sync money math happens in integer cents. Shopify amounts arrive as
 * decimal strings ("108.9"); floats never touch arithmetic. Parsing is
 * strict — a malformed amount is a validation failure, not a NaN that
 * propagates into the books.
 */

export function toCents(amount: string | number | null | undefined): number {
  if (amount === null || amount === undefined || amount === '') {
    throw new Error(`Unparseable money amount: ${JSON.stringify(amount)}`);
  }
  const s = String(amount).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) {
    throw new Error(`Unparseable money amount: ${JSON.stringify(amount)}`);
  }
  const neg = s.startsWith('-');
  const [whole, frac = ''] = (neg ? s.slice(1) : s).split('.');
  if (frac.length > 2 && Number(frac.slice(2)) !== 0) {
    // Sub-cent precision would mean we're silently rounding money.
    throw new Error(`Sub-cent money amount: ${JSON.stringify(amount)}`);
  }
  const cents = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  return neg ? -cents : cents;
}

export function centsToDecimal(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  return `${neg ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
