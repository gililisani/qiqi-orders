'use client';

/**
 * Pick the order a NetSuite document belongs to. Invoices attach to a Hub
 * order only; credits attach to a Hub order or to an invoice already added
 * to sales (sold outside the Hub). The suggestion, when there is one, is
 * preselected — the admin confirms.
 */

import { useEffect, useMemo, useState } from 'react';
import { formatCurrency, formatDate } from '../../../../lib/formatters';
import { Button } from '../../qq/button';
import { Input } from '../../qq/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../qq/dialog';
import { isCredit, type AttachTargets, type ReviewDocument } from './types';

export type AttachChoice = { orderId: string } | { attachedDocumentId: string };

const money = (n: number) => (n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(n));

export function AttachDialog({
  doc,
  targets,
  saving,
  onClose,
  onConfirm,
}: {
  doc: ReviewDocument | null;
  targets: AttachTargets;
  saving: boolean;
  onClose: () => void;
  onConfirm: (choice: AttachChoice) => void;
}) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string | null>(null); // 'o:<id>' | 'd:<id>'

  useEffect(() => {
    setQuery('');
    setPicked(doc?.suggestion ? `${doc.suggestion.kind === 'order' ? 'o' : 'd'}:${doc.suggestion.id}` : null);
  }, [doc]);

  const credit = doc ? isCredit(doc.docType) : false;
  const q = query.trim().toLowerCase();
  // The suggestion (if any) comes first, then the rest in their usual order.
  const first = <T extends { id: string }>(list: T[], kind: 'order' | 'document') =>
    doc?.suggestion?.kind === kind ? [...list.filter((x) => x.id === doc.suggestion!.id), ...list.filter((x) => x.id !== doc.suggestion!.id)] : list;
  const orders = useMemo(
    () => first(targets.orders.filter((o) => !q || `${o.poNumber ?? ''} ${o.status}`.toLowerCase().includes(q)), 'order'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets.orders, q, doc]
  );
  const sales = useMemo(
    () =>
      credit
        ? first(targets.outsideSales.filter((s) => s.id !== doc?.id && (!q || s.tranid.toLowerCase().includes(q))), 'document')
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets.outsideSales, credit, q, doc]
  );
  const suggestedSaleFirst = doc?.suggestion?.kind === 'document';

  const salesList = sales.map((s) => (
    <TargetRow
      key={`d:${s.id}`}
      value={`d:${s.id}`}
      picked={picked}
      onPick={setPicked}
      title={`Billed externally ${s.tranid}`}
      detail={`${formatDate(s.date)} · ${money(s.sales)}`}
      suggested={doc?.suggestion?.kind === 'document' && doc.suggestion.id === s.id ? doc.suggestion.why : null}
    />
  ));

  const confirm = () => {
    if (!picked) return;
    const [kind, id] = [picked.slice(0, 1), picked.slice(2)];
    onConfirm(kind === 'o' ? { orderId: id } : { attachedDocumentId: id });
  };

  return (
    <Dialog open={!!doc} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Attach {doc?.tranid} to an order</DialogTitle>
          <DialogDescription>
            {credit
              ? 'The credit reduces that order’s value. Support funds on the order stay as they are.'
              : 'This invoice bills the Hub order you pick. The order already counts, so nothing is added.'}
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Search PO or invoice number" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-80 overflow-y-auto rounded-md border border-border divide-y divide-border">
          {orders.length === 0 && sales.length === 0 && (
            <p className="p-3 text-sm text-muted-foreground">Nothing matches.</p>
          )}
          {suggestedSaleFirst && salesList}
          {orders.map((o) => (
            <TargetRow
              key={`o:${o.id}`}
              value={`o:${o.id}`}
              picked={picked}
              onPick={setPicked}
              title={`Hub order ${o.poNumber || '—'}`}
              detail={`${o.status} · ${formatDate(o.createdAt)} · ${money(o.total)}`}
              suggested={doc?.suggestion?.kind === 'order' && doc.suggestion.id === o.id ? doc.suggestion.why : null}
            />
          ))}
          {!suggestedSaleFirst && salesList}
        </div>
        {credit && doc?.suggestion?.kind === 'document' && !targets.outsideSales.some((s) => s.id === doc.suggestion!.id) && (
          <p className="text-xs text-amber-700">
            The memo names {doc.suggestion.label}, which isn’t added to sales yet — add it first, then attach this credit.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={!picked || saving} loading={saving}>
            Attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({
  value,
  picked,
  onPick,
  title,
  detail,
  suggested,
}: {
  value: string;
  picked: string | null;
  onPick: (v: string) => void;
  title: string;
  detail: string;
  suggested: string | null;
}) {
  return (
    <label className="flex items-start gap-3 p-3 cursor-pointer hover:bg-secondary/50">
      <input
        type="radio"
        name="attach-target"
        className="mt-1"
        checked={picked === value}
        onChange={() => onPick(value)}
      />
      <span className="text-sm">
        <span className="font-medium">{title}</span>
        {suggested && <span className="ml-2 text-xs text-emerald-700">Suggested ({suggested})</span>}
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
    </label>
  );
}
