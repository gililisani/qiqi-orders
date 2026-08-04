// ---------------------------------------------------------------------------
// Status gating — SINGLE SOURCE for what's allowed at each order status.
// The admin and client detail views carried their own copies of these rules
// and drifted (audit 1.8: three contradictory delete rules). The API route
// /api/orders/delete enforces the same set server-side.
// ---------------------------------------------------------------------------

/** Every order status, in lifecycle order. */
export const ORDER_STATUSES = [
  'Draft',
  'Open',
  'In Process',
  'Ready',
  'Done',
  'Cancelled',
] as const;

/** Statuses an admin can set / filter by — Draft is client-side only
 *  (an admin never moves an order BACK to Draft). */
export const NON_DRAFT_ORDER_STATUSES = ORDER_STATUSES.filter(
  (s) => s !== 'Draft',
) as readonly string[];

/** Orders that can still be edited (admin and client alike). */
export const ORDER_EDITABLE_STATUSES = ['Draft', 'Open'] as const;

/** Statuses where the packing slip exists / can be shown. */
export const PACKING_SLIP_STATUSES = ['Ready', 'Done'] as const;

/** Admins may delete dead-end orders directly (matches /api/orders/delete). */
export const ADMIN_DELETABLE_STATUSES = ['Draft', 'Cancelled'] as const;

/** Product rule (deliberate): clients delete only Cancelled orders — a
 *  draft is cancelled first, then deleted. Cleaner lifecycle. */
export const CLIENT_DELETABLE_STATUSES = ['Cancelled'] as const;

export function canEditOrder(status: string | null | undefined): boolean {
  return (ORDER_EDITABLE_STATUSES as readonly string[]).includes(status ?? '');
}

export function canShowPackingSlip(status: string | null | undefined): boolean {
  return (PACKING_SLIP_STATUSES as readonly string[]).includes(status ?? '');
}

export function canDeleteOrder(
  role: 'admin' | 'client',
  status: string | null | undefined,
): boolean {
  const set = role === 'admin' ? ADMIN_DELETABLE_STATUSES : CLIENT_DELETABLE_STATUSES;
  return (set as readonly string[]).includes(status ?? '');
}

export type OrderRecipientInfo = {
  client?: { email?: string | null } | null;
  company?: { ship_to_contact_email?: string | null; company_email?: string | null } | null;
};

export function getActualRecipientEmail(order: OrderRecipientInfo | null | undefined): string {
  if (!order) return 'No email configured';

  // Check if user_id is a client (not admin)
  // If user_id exists and client.email is NOT an admin email, use it
  const isAdminCreated = order.client?.email?.endsWith('@qiqiglobal.com') || false;

  if (order.client?.email && !isAdminCreated) {
    return order.client.email;
  }

  // Otherwise use company fallback emails
  return (
    order.company?.ship_to_contact_email ||
    order.company?.company_email ||
    'No email configured (email will be skipped)'
  );
}

export function validateRequiredFieldsForStatus(params: {
  status: string;
  adminSoNumber: string;
  adminInvoiceNumber: string;
  adminNumberOfPallets: string;
}): string[] {
  const errors: string[] = [];

  if (params.status === 'In Process' || params.status === 'Ready' || params.status === 'Done') {
    if (!params.adminSoNumber || params.adminSoNumber.trim() === '') {
      errors.push('so_number');
    }
  }

  if (params.status === 'Ready' || params.status === 'Done') {
    if (!params.adminInvoiceNumber || params.adminInvoiceNumber.trim() === '') {
      errors.push('invoice_number');
    }
    if (!params.adminNumberOfPallets || params.adminNumberOfPallets.trim() === '') {
      errors.push('number_of_pallets');
    }
  }

  return errors;
}

export type StatusChangeEmailType = 'in_process' | 'ready' | 'cancelled';

export function getStatusChangeEmailType(status: string): StatusChangeEmailType | null {
  if (status === 'In Process') return 'in_process';
  if (status === 'Ready') return 'ready';
  if (status === 'Cancelled') return 'cancelled';
  return null;
}

