'use client';

/**
 * Download button for an order's NetSuite invoice PDF (Billing Phase B).
 * Fetches /api/orders/[id]/invoice-pdf — the document is rendered inside
 * NetSuite with the account's own invoice template; this button only saves
 * the bytes. Used on the client billing page, the client order details
 * Invoice card, and the admin order details view.
 */

import { useState } from 'react';
import { FileDown } from 'lucide-react';

import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { Button } from '../qq/button';
import { useToast } from '../ui/ToastProvider';

export function InvoiceDownloadButton({
  orderId,
  invoiceNumber,
  kind = 'invoice',
  variant = 'outline',
  size = 'sm',
  label,
}: {
  orderId: string;
  invoiceNumber?: string | null;
  /** 'invoice' = the invoice PDF; 'payment' = the payment-confirmation PDF. */
  kind?: 'invoice' | 'payment';
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
}) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const noun = kind === 'payment' ? 'payment confirmation' : 'invoice';
  const buttonLabel = label ?? (kind === 'payment' ? 'Payment PDF' : 'Invoice PDF');

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetchWithAuth(
        `/api/orders/${orderId}/${kind === 'payment' ? 'payment-pdf' : 'invoice-pdf'}`
      );
      if (!res.ok) {
        let message = `Failed to download the ${noun}.`;
        try {
          const body = await res.json();
          if (body?.error) message = body.error;
        } catch {
          /* non-JSON error body — keep the generic message */
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const prefix = kind === 'payment' ? 'Payment' : 'Invoice';
      a.download = invoiceNumber ? `${prefix}-${invoiceNumber}.pdf` : `${prefix}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || `Failed to download the ${noun}.`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleDownload} loading={downloading}>
      <FileDown className="h-4 w-4" />
      {downloading ? 'Fetching…' : buttonLabel}
    </Button>
  );
}
