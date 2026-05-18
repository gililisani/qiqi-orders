// Build URLs that open a NetSuite record in the NS UI for the configured account.
// Returns null if NEXT_PUBLIC_NETSUITE_ACCOUNT_ID isn't set (e.g. local dev), so
// the UI can hide the link gracefully.

function baseUrl(): string | null {
  const accountId = process.env.NEXT_PUBLIC_NETSUITE_ACCOUNT_ID;
  if (!accountId) return null;
  const subdomain = accountId.toLowerCase().replace(/_/g, '-');
  return `https://${subdomain}.app.netsuite.com`;
}

export function salesOrderUrl(internalId: string | number): string | null {
  const b = baseUrl();
  return b ? `${b}/app/accounting/transactions/salesord.nl?id=${internalId}` : null;
}

export function invoiceUrl(internalId: string | number): string | null {
  const b = baseUrl();
  return b ? `${b}/app/accounting/transactions/custinvc.nl?id=${internalId}` : null;
}
