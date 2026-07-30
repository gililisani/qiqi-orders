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

// Amazon FBA import record types → NS UI paths.
const FBA_STEP_PATHS: Record<string, string> = {
  cashSale: 'cashsale.nl',
  cashRefund: 'cashrfnd.nl',
  vendorBill: 'vendbill.nl',
  billPayment: 'vendpymt.nl',
  journal: 'journal.nl',
};

/** URL for a record created by the Amazon FBA import, by step name. */
export function amazonFbaRecordUrl(
  step: string,
  internalId: string | number | undefined
): string | null {
  const b = baseUrl();
  const path = FBA_STEP_PATHS[step];
  if (!b || !path || !internalId) return null;
  return `${b}/app/accounting/transactions/${path}?id=${internalId}`;
}
