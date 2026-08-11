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
  variant = 'outline',
  size = 'sm',
  label = 'Invoice PDF',
}: {
  orderId: string;
  invoiceNumber?: string | null;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
}) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetchWithAuth(`/api/orders/${orderId}/invoice-pdf`);
      if (!res.ok) {
        let message = 'Failed to download the invoice.';
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
      a.download = invoiceNumber ? `Invoice-${invoiceNumber}.pdf` : 'Invoice.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err.message || 'Failed to download the invoice.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button variant={variant} size={size} onClick={handleDownload} loading={downloading}>
      <FileDown className="h-4 w-4" />
      {downloading ? 'Fetching…' : label}
    </Button>
  );
}
