'use client';

import { formatCurrency } from '../../../../lib/formatters';
import type { ReviewDocument } from './types';

const money = (n: number) => (n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(n));

/** A NetSuite document's lines and what each one counts as. */
export function DocumentLines({ doc }: { doc: ReviewDocument }) {
  return (
    <div>
      {doc.memo && <p className="text-xs text-muted-foreground mb-1">Memo: {doc.memo}</p>}
      {doc.poRef && <p className="text-xs text-muted-foreground mb-1">PO: {doc.poRef}</p>}
      {doc.soTranid && <p className="text-xs text-muted-foreground mb-1">Sales order: {doc.soTranid}</p>}
      <table className="w-full text-xs mt-1">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-normal py-1">Line</th>
            <th className="text-left font-normal py-1">Counts as</th>
            <th className="text-right font-normal py-1">Qty</th>
            <th className="text-right font-normal py-1">Amount (USD)</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.line_no} className="border-t border-border/50">
              <td className="py-1">
                <span className="font-mono">{l.sku || '—'}</span>
                {l.item_name && l.item_name !== l.sku && <span className="text-muted-foreground"> · {l.item_name}</span>}
              </td>
              <td className="py-1">
                {l.kind === 'product'
                  ? l.amount === 0
                    ? 'Product (free goods)'
                    : 'Product'
                  : l.kind === 'discount'
                    ? 'Support funds (discount)'
                    : 'Not counted (shipping, fees, other)'}
              </td>
              <td className="py-1 text-right tabular-nums">{l.kind === 'product' ? l.quantity : ''}</td>
              <td className="py-1 text-right tabular-nums">
                {l.kind === 'discount' ? money(Math.abs(l.amount)) : money(l.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Document total {money(doc.totalAmount)}
        {doc.excluded ? ` − not counted ${money(doc.excluded)}` : ''} = products {money(doc.sales)}
        {doc.supportFund ? ` · support funds ${money(doc.supportFund)}` : ''}
        {doc.currency !== 'USD' ? ` · converted from ${doc.currency} ${formatCurrency(doc.totalForeign, false)}` : ''}.
      </p>
    </div>
  );
}
