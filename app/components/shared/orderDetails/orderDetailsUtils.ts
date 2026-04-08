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

export function build3PLExportPayload(params: {
  orderData: { id: string; so_number: string; created_at: string };
  company: any;
  items: any[];
}): {
  id: string;
  so_number: string;
  created_at: string;
  company: any;
  order_items: any[];
} {
  return {
    id: params.orderData.id,
    so_number: params.orderData.so_number,
    created_at: params.orderData.created_at,
    company: params.company,
    order_items: params.items,
  };
}

export function build3PLFilename(orderData: { so_number?: string | null; id: string }): string {
  const soNumber = orderData.so_number || orderData.id.substring(0, 6);
  return `3PL_Order_${soNumber}.xlsx`;
}

