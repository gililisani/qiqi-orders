'use client';

/**
 * One calendar month of the parsed Amazon report: previews of every NetSuite
 * record about to be created, a visually-loud resolver for rows the parser
 * couldn't decode, a reconciliation banner, and the push button.
 */

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Upload,
  BadgeCheck,
} from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { amazonFbaRecordUrl } from '../../../../lib/netsuiteUrls';
import type { MonthPreview, AttentionRow } from '../../../../lib/amazonFba/parseReport';
import { applyResolutions, type RowResolution } from '../../../../lib/amazonFba/applyResolutions';
import { Card, CardContent, CardHeader, CardTitle } from '../../qq/card';
import { Button } from '../../qq/button';
import { Input } from '../../qq/input';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '../../qq/table';
import { useToast } from '../../ui/ToastProvider';
import { NsItemSearchInput, type NsItem } from './NsItemSearchInput';

const money = (n: number) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface BatchInfo {
  period: string;
  status: string;
  ns_refs: Record<string, { nsId?: string; tranId?: string; status: string }>;
}

interface EditorLine {
  item: NsItem | null;
  quantity: number;
  unitPrice: number;
}

const REASON_LABEL: Record<AttentionRow['reason'], string> = {
  'multi-product': 'Multiple products in one row — Amazon truncated the list. Enter the actual items.',
  'unmapped-product': 'Unknown product — map it to a NetSuite item first.',
  'ambiguous-quantity': 'Charge does not divide by the mapped unit price. Enter the actual lines.',
  'unknown-type': 'Unknown transaction type — review, then acknowledge to proceed.',
};

export function AmazonFbaMonthCard({
  preview,
  batch,
  missingConfig,
  onRequestMapProduct,
  onPushed,
}: {
  preview: MonthPreview;
  batch: BatchInfo | null;
  missingConfig: string[];
  onRequestMapProduct: (amazonName: string, suggestedPrice: number) => void;
  onPushed: () => void;
}) {
  const toast = useToast();
  const [resolutions, setResolutions] = useState<RowResolution[]>([]);
  const [editors, setEditors] = useState<Record<number, EditorLine[]>>({});
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState<{ step: string; status: string; tranId?: string }[] | null>(null);

  const { preview: effective } = useMemo(
    () => applyResolutions(preview, resolutions),
    [preview, resolutions]
  );

  const pushed = batch?.status === 'pushed';
  const canPush =
    !pushed && effective.reconciles && missingConfig.length === 0 && !pushing;

  function editorFor(index: number): EditorLine[] {
    return editors[index] || [{ item: null, quantity: 1, unitPrice: 0 }];
  }

  function setEditor(index: number, lines: EditorLine[]) {
    setEditors((p) => ({ ...p, [index]: lines }));
  }

  function editorSum(lines: EditorLine[]): number {
    return Math.round(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) * 100) / 100;
  }

  function resolveRow(index: number) {
    const lines = editorFor(index).filter((l) => l.item);
    setResolutions((p) => [
      ...p.filter((r) => r.attentionIndex !== index),
      {
        attentionIndex: index,
        lines: lines.map((l) => ({
          nsItemId: l.item!.id,
          nsItemName: l.item!.itemid,
          quantity: Math.round(l.quantity),
          unitPrice: l.unitPrice,
        })),
      },
    ]);
  }

  function acknowledgeRow(index: number) {
    setResolutions((p) => [
      ...p.filter((r) => r.attentionIndex !== index),
      { attentionIndex: index, ignored: true },
    ]);
  }

  async function push() {
    setPushing(true);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: effective.period,
          periodLabel: effective.periodLabel,
          tranDate: effective.tranDate,
          saleLines: effective.saleLines,
          discountTotal: effective.discountTotal,
          refundTotal: effective.refundTotal,
          feeLines: effective.feeLines,
          reimbursementTotal: effective.reimbursementTotal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Push failed.');
      setPushResults(data.results || []);
      toast.success(`${effective.periodLabel} pushed to NetSuite.`);
      onPushed();
    } catch (err: any) {
      toast.error(err.message || 'Push failed.');
      onPushed(); // refresh — a partial push may have created some records
    } finally {
      setPushing(false);
    }
  }

  // Which attention rows are still unresolved (index within original preview)?
  const resolvedIndexes = new Set(resolutions.map((r) => r.attentionIndex));
  const openAttention = preview.needsAttention
    .map((attention, index) => ({ attention, index }))
    .filter(({ attention, index }) => {
      if (!resolvedIndexes.has(index)) return true;
      // A resolution that no longer passes validation re-opens the row.
      return effective.needsAttention.includes(attention);
    });

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          {effective.periodLabel}
          {pushed && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <BadgeCheck className="h-3.5 w-3.5" /> Pushed to NetSuite
            </span>
          )}
        </CardTitle>
        {!pushed && (
          <Button onClick={push} disabled={!canPush} loading={pushing} size="sm">
            <Upload className="h-4 w-4" />
            Push to NetSuite
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reconciliation banner */}
        <div
          className={`rounded-md border px-4 py-3 text-sm flex items-start gap-2 ${
            effective.reconciles || pushed
              ? 'border-green-200 bg-green-50 text-green-800'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
        >
          {effective.reconciles || pushed ? (
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          )}
          <div>
            <span className="font-medium">
              {money(effective.grossSales)} sales
              {effective.discountTotal !== 0 && <> {effective.discountTotal > 0 ? '+' : '−'} {money(Math.abs(effective.discountTotal))} promos</>}
              {effective.refundTotal !== 0 && <> − {money(Math.abs(effective.refundTotal))} refunds</>}
              {effective.feeTotal !== 0 && <> − {money(effective.feeTotal)} Amazon fees</>}
              {effective.reimbursementTotal !== 0 && <> + {money(effective.reimbursementTotal)} reimbursements</>}
              {' = '}{money(effective.computedNet)}
            </span>{' '}
            <span className="opacity-80">
              — report says {money(effective.reportNet)}.{' '}
              {effective.reconciles
                ? 'Reconciles to the cent.'
                : openAttention.length > 0
                  ? `${openAttention.length} row(s) below need your attention before pushing.`
                  : 'Numbers do not reconcile — do not push; check the file.'}
            </span>
            {effective.skippedBalanceRows > 0 && (
              <span className="block text-xs opacity-70 mt-0.5">
                {effective.skippedBalanceRows} reserve-balance rows skipped (bookkeeping noise).
              </span>
            )}
          </div>
        </div>

        {missingConfig.length > 0 && !pushed && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Missing NetSuite IDs in Settings: {missingConfig.join(', ')}.
          </div>
        )}

        {/* Needs attention */}
        {openAttention.length > 0 && !pushed && (
          <div className="rounded-md border-2 border-amber-400 overflow-hidden">
            <div className="bg-amber-100 text-amber-900 px-4 py-2 text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Needs attention ({openAttention.length})
            </div>
            <div className="divide-y divide-border">
              {openAttention.map(({ attention, index }) => {
                const lines = editorFor(index);
                const sum = editorSum(lines);
                const target = attention.row.productCharges;
                const matches = Math.abs(sum - target) < 0.005 && lines.every((l) => l.item && l.quantity > 0);
                return (
                  <div key={index} className="px-4 py-3 space-y-3">
                    <div className="text-sm">
                      <span className="font-mono text-xs">{attention.row.date}</span>{' '}
                      <span className="font-mono text-xs">{attention.row.orderId || '—'}</span>{' '}
                      <span className="font-medium">“{attention.row.product}”</span>
                      {attention.reason !== 'unknown-type' && (
                        <span className="ml-2 font-mono">{money(target)}</span>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">{REASON_LABEL[attention.reason]}</p>
                    </div>

                    {attention.reason === 'unknown-type' ? (
                      <Button variant="outline" size="sm" onClick={() => acknowledgeRow(index)}>
                        Acknowledge — book nothing for this row
                      </Button>
                    ) : attention.reason === 'unmapped-product' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onRequestMapProduct(attention.row.product, target)}
                      >
                        Map this product to a NetSuite item
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        {lines.map((line, li) => (
                          <div key={li} className="flex flex-col sm:flex-row gap-2 sm:items-center">
                            <div className="flex-1 min-w-0">
                              <NsItemSearchInput
                                selected={line.item}
                                onSelect={(item) =>
                                  setEditor(index, lines.map((l, i) => (i === li ? { ...l, item } : l)))
                                }
                              />
                            </div>
                            <Input
                              type="number" min={1} value={line.quantity}
                              onChange={(e) =>
                                setEditor(index, lines.map((l, i) => (i === li ? { ...l, quantity: parseInt(e.target.value) || 1 } : l)))
                              }
                              className="w-full sm:w-20" placeholder="Qty"
                            />
                            <Input
                              type="number" min={0} step="0.01" value={line.unitPrice || ''}
                              onChange={(e) =>
                                setEditor(index, lines.map((l, i) => (i === li ? { ...l, unitPrice: parseFloat(e.target.value) || 0 } : l)))
                              }
                              className="w-full sm:w-28" placeholder="Unit price"
                            />
                            <Button
                              variant="ghost" size="icon" aria-label="Remove line"
                              onClick={() => setEditor(index, lines.filter((_, i) => i !== li))}
                              disabled={lines.length === 1}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex items-center gap-3">
                          <Button
                            variant="outline" size="sm"
                            onClick={() => setEditor(index, [...lines, { item: null, quantity: 1, unitPrice: 0 }])}
                          >
                            <Plus className="h-4 w-4" /> Add line
                          </Button>
                          <span className={`text-sm font-mono ${matches ? 'text-green-700' : 'text-amber-700'}`}>
                            {money(sum)} / {money(target)}
                          </span>
                          <Button size="sm" disabled={!matches} onClick={() => resolveRow(index)}>
                            {matches ? '✓ Resolve' : 'Lines must sum to the charge'}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Record previews */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cash Sale */}
          {(effective.saleLines.length > 0 || effective.discountTotal !== 0) && (
            <div className="border border-border rounded-md overflow-hidden lg:col-span-2">
              <div className="px-4 py-2 bg-muted/50 text-sm font-semibold flex items-center justify-between">
                <span>Cash Sale — AMAZON-FBA-{effective.period} · {effective.orderCount} orders</span>
                <span className="font-mono">{money(effective.grossSales + effective.discountTotal)}</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Amazon Order</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {effective.saleLines.map((line, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{line.orderId}</TableCell>
                        <TableCell className="text-sm">{line.nsItemName}</TableCell>
                        <TableCell className="text-right text-sm">{line.quantity}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{money(line.unitPrice)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{money(line.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {effective.discountTotal !== 0 && (
                      <TableRow>
                        <TableCell className="text-xs text-muted-foreground">—</TableCell>
                        <TableCell className="text-sm italic">Discount (seller-funded promotions)</TableCell>
                        <TableCell className="text-right text-sm">1</TableCell>
                        <TableCell className="text-right font-mono text-sm">{money(effective.discountTotal)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{money(effective.discountTotal)}</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* Refund */}
          {effective.refundTotal !== 0 && (
            <div className="border border-border rounded-md">
              <div className="px-4 py-2 bg-muted/50 text-sm font-semibold flex items-center justify-between">
                <span>Cash Refund — {effective.refundCount} refund(s)</span>
                <span className="font-mono">{money(effective.refundTotal)}</span>
              </div>
              <p className="px-4 py-3 text-xs text-muted-foreground">
                One “Refund Adjustment” line, no inventory impact — returned sellable units are
                trued up by the periodic FBA inventory adjustment.
              </p>
            </div>
          )}

          {/* Vendor bill */}
          {effective.feeLines.length > 0 && (
            <div className="border border-border rounded-md">
              <div className="px-4 py-2 bg-muted/50 text-sm font-semibold flex items-center justify-between">
                <span>Vendor Bill + Payment — V5322 AMAZON</span>
                <span className="font-mono">{money(effective.feeTotal)}</span>
              </div>
              <div className="px-4 py-2">
                {effective.feeLines.map((line, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-0.5">
                    <span>
                      {line.label}
                      {line.bucket === 'advertising' && (
                        <span className="ml-1 text-xs text-muted-foreground">(630040)</span>
                      )}
                    </span>
                    <span className="font-mono">{money(line.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Journal */}
          {effective.reimbursementTotal !== 0 && (
            <div className="border border-border rounded-md">
              <div className="px-4 py-2 bg-muted/50 text-sm font-semibold flex items-center justify-between">
                <span>Journal — FBA reimbursements</span>
                <span className="font-mono">{money(effective.reimbursementTotal)}</span>
              </div>
              <p className="px-4 py-3 text-xs text-muted-foreground">
                Debit 100505 Amazon account / credit 620070 write-off account.
              </p>
            </div>
          )}
        </div>

        {/* Push results / pushed refs */}
        {(pushResults || (pushed && batch)) && (
          <div className="border border-green-200 bg-green-50 rounded-md px-4 py-3 text-sm text-green-900 space-y-1">
            {(pushResults ||
              Object.entries(batch?.ns_refs || {}).map(([step, ref]) => ({ step, ...ref }))
            ).map((r: any, i: number) => {
              const url = amazonFbaRecordUrl(r.step, r.nsId);
              return (
                <div key={i} className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span className="capitalize">{r.step}</span>
                  <span className="text-xs opacity-70">{r.status}</span>
                  {r.tranId &&
                    (url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs underline underline-offset-2 hover:opacity-70"
                      >
                        {r.tranId} ↗
                      </a>
                    ) : (
                      <span className="font-mono text-xs">{r.tranId}</span>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
