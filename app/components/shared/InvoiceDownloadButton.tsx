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

const KIND_CONFIG = {
  invoice: { endpoint: 'invoice-pdf', prefix: 'Invoice', noun: 'invoice', label: 'Invoice PDF' },
  payment: { endpoint: 'payment-pdf', prefix: 'Payment', noun: 'payment confirmation', label: 'Payment PDF' },
  so: { endpoint: 'so-pdf', prefix: 'SalesOrder', noun: 'sales order', label: 'SO PDF' },
} as const;

export function InvoiceDownloadButton({
  orderId,
  invoiceNumber,
  kind = 'invoice',
  variant = 'outline',
  size = 'sm',
  label,
}: {
  orderId: string;
  /** Document number used for the local filename (invoice # or SO #). */
  invoiceNumber?: string | null;
  kind?: 'invoice' | 'payment' | 'so';
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm';
  label?: string;
}) {
  const toast = useToast();
  const [downloading, setDownloading] = useState(false);
  const cfg = KIND_CONFIG[kind];
  const noun = cfg.noun;
  const buttonLabel = label ?? cfg.label;

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetchWithAuth(`/api/orders/${orderId}/${cfg.endpoint}`);
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
      a.download = invoiceNumber ? `${cfg.prefix}-${invoiceNumber}.pdf` : `${cfg.prefix}.pdf`;
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
