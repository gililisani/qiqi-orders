'use client';

/**
 * NetSuite documents an admin attached to this Hub order on the NetSuite
 * review page: credits (damaged or short-shipped products — never support
 * funds) with the products credited and the order value after credits, plus
 * invoices that bill this order but weren't linked by NetSuite. Renders
 * nothing when there are none.
 */

import { useEffect, useState } from 'react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';

interface AttachedDoc {
  id: string;
  tranid: string;
  date: string;
  amount: number;
  netsuiteId: string | null;
  products: Array<{ sku: string | null; name: string | null; quantity: number; amount: number }>;
}

const money = (n: number) => (n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(n));

export default function OrderNetSuiteCredits({ orderId, orderTotal }: { orderId: string; orderTotal: number }) {
  const [credits, setCredits] = useState<AttachedDoc[]>([]);
  const [invoices, setInvoices] = useState<AttachedDoc[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/orders/${orderId}/netsuite-credits`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        setCredits(json.credits ?? []);
        setInvoices(json.invoices ?? []);
      } catch {
        // Informational card — the order page works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!credits.length && !invoices.length) return null;
  const creditTotal = credits.reduce((s, c) => s + c.amount, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">NetSuite credits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {credits.map((c) => (
          <div key={c.id}>
            <div className="flex items-baseline justify-between gap-3">
              <DocLink doc={c} />
              <span className="tabular-nums">{money(c.amount)}</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {c.products.map((p, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span>
                    <span className="font-mono">{p.sku || '—'}</span>
                    {p.name && p.name !== p.sku ? ` · ${p.name}` : ''} × {Math.abs(p.quantity)}
                  </span>
                  <span className="tabular-nums">{money(p.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {credits.length > 0 && (
          <div className="flex justify-between border-t border-border pt-2 font-medium">
            <span>Order value after credits</span>
            <span className="tabular-nums">{money(orderTotal + creditTotal)}</span>
          </div>
        )}
        {credits.length > 0 && <p className="text-xs text-muted-foreground">Support funds on this order are unchanged.</p>}
        {invoices.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Also billed in NetSuite (attached by an admin):</p>
            {invoices.map((i) => (
              <div key={i.id} className="flex items-baseline justify-between gap-3">
                <DocLink doc={i} />
                <span className="tabular-nums">{money(i.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DocLink({ doc }: { doc: AttachedDoc }) {
  return (
    <span>
      <span className="font-mono">{doc.tranid}</span>
      <span className="text-xs text-muted-foreground"> · {formatDate(doc.date)}</span>
    </span>
  );
}
