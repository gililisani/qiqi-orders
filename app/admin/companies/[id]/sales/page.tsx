'use client';

/**
 * NetSuite review for one company (owner 2026-10-08: Hub first).
 *
 * Nothing from NetSuite counts toward the client's sales until an admin
 * decides here. Invoices NetSuite links to a Hub order (same sales order)
 * need no decision; everything else waits in "To review":
 *   invoices with no Hub order → add to sales / attach to a Hub order / ignore
 *   credits (never support funds) → attach to an order / record for the
 *   company / ignore
 * Every decision shows who made it and when, and can be undone. The rules
 * live in lib/salesLedger/review.ts.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, MoreHorizontal, RefreshCw } from 'lucide-react';

import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { formatCurrency, formatDate, formatDateTime } from '../../../../../lib/formatters';
import { PageHeader } from '../../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/qq/card';
import { Badge } from '../../../../components/qq/badge';
import { Button } from '../../../../components/qq/button';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { EmptyState } from '../../../../components/qq/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../components/qq/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/qq/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/qq/dropdown-menu';
import { useToast } from '../../../../components/ui/ToastProvider';
import { DocumentLines } from '../../../../components/admin/netsuiteReview/DocumentLines';
import { AttachDialog, type AttachChoice } from '../../../../components/admin/netsuiteReview/AttachDialog';
import { IgnoreDialog } from '../../../../components/admin/netsuiteReview/IgnoreDialog';
import {
  DOC_TYPE,
  isCredit,
  type OrderState,
  type ReviewDecision,
  type ReviewDocument,
  type ReviewPayload,
} from '../../../../components/admin/netsuiteReview/types';

const STATE: Record<OrderState, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  billed: { label: 'Billed', variant: 'success' },
  partly_billed: { label: 'Billed less', variant: 'warning' },
  billed_more: { label: 'Billed more', variant: 'warning' },
  not_billed: { label: 'Not billed yet', variant: 'muted' },
  cancelled_but_billed: { label: 'Cancelled but billed', variant: 'destructive' },
};

const money = (n: number) => (n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(n));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function NetSuiteReviewPage() {
  const params = useParams<{ id: string }>();
  const companyId = params?.id as string;
  const toast = useToast();
  const [data, setData] = useState<ReviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('review');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [attachDoc, setAttachDoc] = useState<ReviewDocument | null>(null);
  const [ignoreIds, setIgnoreIds] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/sales-ledger/company/${companyId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load.');
      setData(json);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const syncNow = async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/sales-ledger/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Sync failed.');
      if (json.summary?.errors?.length) throw new Error(json.summary.errors[0].error);
      toast.success(`Synced ${json.summary.documents} documents from NetSuite.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const postDecision = async (ids: string[], decision: ReviewDecision, extra: Record<string, string> = {}) => {
    const res = await fetchWithAuth(`/api/sales-ledger/company/${companyId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentIds: ids, decision, ...extra }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Failed to save.');
    return Number(json.saved) || 0;
  };

  const decide = async (ids: string[], decision: ReviewDecision, extra: Record<string, string> = {}) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await postDecision(ids, decision, extra);
      toast.success(`${saved} document${saved === 1 ? '' : 's'} decided.`);
      setSelected(new Set());
      setAttachDoc(null);
      setIgnoreIds([]);
      await load();
    } catch (err: any) {
      setError(err.message);
      setAttachDoc(null);
      setIgnoreIds([]);
    } finally {
      setSaving(false);
    }
  };

  /** Credits with a NetSuite link: one click applies what NetSuite says. */
  const quickAction = (d: ReviewDocument): { label: string; decision: ReviewDecision; extra: Record<string, string> } | null => {
    const sug = d.suggestion;
    if (!data || !sug || !isCredit(d.docType)) return null;
    if (sug.kind === 'order' && sug.id && data.attachTargets.orders.some((o) => o.id === sug.id)) {
      return { label: `Attach to ${sug.label}`, decision: 'attach', extra: { orderId: sug.id } };
    }
    if (sug.kind === 'document' && sug.id && data.attachTargets.outsideSales.some((x) => x.id === sug.id)) {
      return { label: `Attach to ${sug.label}`, decision: 'attach', extra: { attachedDocumentId: sug.id } };
    }
    if (sug.kind === 'ignore') return { label: 'Ignore like its invoice', decision: 'ignore', extra: { reason: sug.label } };
    return null;
  };

  const acceptAllSuggestions = async (list: ReviewDocument[]) => {
    setSaving(true);
    setError(null);
    let done = 0;
    try {
      for (const d of list) {
        const q = quickAction(d);
        if (!q) continue;
        done += await postDecision([d.id], q.decision, q.extra);
      }
      toast.success(`${done} credit${done === 1 ? '' : 's'} decided from NetSuite's links.`);
    } catch (err: any) {
      setError(`${done} decided, then: ${err.message}`);
    } finally {
      await load();
      setSaving(false);
    }
  };

  const undo = async (doc: ReviewDocument) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/sales-ledger/company/${companyId}/review`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds: [doc.id] }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Failed to undo.');
      toast.success(`${doc.tranid} is back in To review.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const docs = useMemo(() => data?.documents ?? [], [data]);
  const toReview = docs.filter((d) => d.status === 'to_review');
  const invoices = toReview.filter((d) => !isCredit(d.docType));
  const credits = toReview.filter((d) => isCredit(d.docType));
  const decided = useMemo(
    () => docs.filter((d) => d.status === 'decided').sort((a, b) => (a.review!.decidedAt < b.review!.decidedAt ? 1 : -1)),
    [docs]
  );
  const nothing = docs.filter((d) => d.status === 'nothing_to_count');
  const ordersToCheck = (data?.orders ?? []).filter(
    (o) => o.state === 'partly_billed' || o.state === 'billed_more' || o.state === 'cancelled_but_billed'
  ).length;
  const poById = new Map((data?.orders ?? []).map((o) => [o.orderId, o.poNumber]));
  const tranidById = new Map(docs.map((d) => [d.id, d.tranid]));
  const contract = data?.company.contractDate ?? null;
  const allSelected = invoices.length > 0 && invoices.every((d) => selected.has(d.id));

  const decisionText = (d: ReviewDocument) => {
    const r = d.review!;
    if (r.decision === 'outside_sale') return 'Added to sales (billed externally)';
    if (r.decision === 'company_credit') return 'Credit recorded for the company';
    if (r.decision === 'ignore') return `Ignored — ${r.reason}`;
    if (r.orderId) return `Attached to Hub order ${poById.get(r.orderId) || '—'}`;
    return `Attached to ${tranidById.get(r.attachedDocumentId ?? '') ?? 'an invoice'} (billed externally)`;
  };

  const docCell = (d: ReviewDocument) => (
    <>
      <span className="font-mono whitespace-nowrap">{d.tranid}</span>
      <div className="flex flex-wrap gap-1 mt-1">
        {d.docType !== 'invoice' && <Badge variant="outline">{DOC_TYPE[d.docType] ?? d.docType}</Badge>}
        {contract && d.date < contract && <Badge variant="muted">Before agreement</Badge>}
        {d.currency !== 'USD' && (
          <Badge variant="muted">
            {d.currency} {formatCurrency(d.totalForeign, false)}
          </Badge>
        )}
      </div>
    </>
  );

  const expandRow = (d: ReviewDocument, colSpan: number) =>
    open.has(d.id) && (
      <TableRow>
        <TableCell />
        <TableCell colSpan={colSpan} className="bg-muted/30">
          <DocumentLines doc={d} />
        </TableCell>
      </TableRow>
    );

  const chevron = (d: ReviewDocument) => (
    <button type="button" className="text-muted-foreground" onClick={() => setOpen((s) => toggle(s, d.id))} aria-label="Show lines">
      {open.has(d.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
    </button>
  );

  const suggestionNote = (d: ReviewDocument) => {
    const sug = d.suggestion;
    if (!sug) return null;
    if (sug.kind === 'note') return <p className="text-xs text-muted-foreground mt-1">{sug.why}</p>;
    if (sug.kind === 'ignore') return <p className="text-xs text-amber-700 mt-1">{sug.why} — ignore it too?</p>;
    const waiting = sug.kind === 'document' && !data?.attachTargets.outsideSales.some((x) => x.id === sug.id);
    return (
      <p className="text-xs text-emerald-700 mt-1">
        Likely {sug.kind === 'order' ? `Hub order ${sug.label}` : sug.label} ({sug.why})
        {waiting && <span className="text-amber-700"> — add {sug.label} to sales first</span>}
      </p>
    );
  };

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/admin/companies/${companyId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to company
        </Link>
      </div>

      <PageHeader
        title="NetSuite review"
        description={
          data
            ? `${data.company.name}${data.company.netsuiteNumber ? ` · NetSuite #${data.company.netsuiteNumber}` : ''}`
            : undefined
        }
        actions={
          <Button size="sm" variant="outline" onClick={syncNow} disabled={syncing || !data?.company.linked}>
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync now'}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {data && !data.company.linked && (
        <Alert>
          <AlertDescription>
            This company has no NetSuite customer ID, so its NetSuite documents can&apos;t be read. Add it on the
            company&apos;s edit page.
          </AlertDescription>
        </Alert>
      )}
      {data && data.company.linked && !data.historyStartDate && (
        <Alert>
          <AlertDescription>
            The NetSuite sync is off until a history start date is set in{' '}
            <Link href="/admin/settings?tab=sales" className="underline">
              Settings → Sales
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <p className="text-sm text-muted-foreground">
        The Hub comes first: nothing from NetSuite counts toward this client&apos;s sales until it&apos;s decided here.
        Invoices NetSuite links to a Hub order need no decision. Credits never touch support funds. Decisions count
        toward the client&apos;s sales and goals right away. Amounts are products only, in USD.
        {data?.sync?.last_synced_at ? ` Last synced ${formatDateTime(data.sync.last_synced_at)}.` : ' Not synced yet.'}
        {data?.sync?.last_error ? ` Last sync failed: ${data.sync.last_error}` : ''}
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Tile
          label="To review"
          value={data ? String(data.counts.toReviewInvoices + data.counts.toReviewCredits) : '—'}
          sub={data ? `${plural(data.counts.toReviewInvoices, 'invoice')} · ${plural(data.counts.toReviewCredits, 'credit')}` : undefined}
        />
        <Tile label="Added to sales" value={data ? money(data.decidedTotals.outsideSales) : '—'} sub="billed externally" />
        <Tile label="Credits recorded" value={data ? money(data.decidedTotals.credits) : '—'} sub="attached or for the company" />
        <Tile label="Hub orders to check" value={data ? String(ordersToCheck) : '—'} sub="billed less, more, or cancelled" />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="review">To review ({toReview.length})</TabsTrigger>
          <TabsTrigger value="orders">Hub orders ({data?.orders.length ?? 0})</TabsTrigger>
          <TabsTrigger value="decided">Decided ({decided.length})</TabsTrigger>
          <TabsTrigger value="nothing">Nothing to count ({nothing.length})</TabsTrigger>
        </TabsList>

        {/* ---------------- To review ---------------- */}
        <TabsContent value="review" className="pt-4 space-y-6">
          {loading && !data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : toReview.length === 0 ? (
            <EmptyState title="Nothing to review" description="Every NetSuite document for this company is decided or linked to a Hub order." />
          ) : null}

          {invoices.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Invoices with no Hub order ({invoices.length})</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Add to sales when the client bought it outside the Hub. Attach it when it bills a Hub order NetSuite
                  didn&apos;t link. Ignore it when it shouldn&apos;t count.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-sm text-muted-foreground">{selected.size} selected</span>
                  <Button size="sm" disabled={!selected.size || saving} onClick={() => decide(Array.from(selected), 'outside_sale')}>
                    Add selected to sales
                  </Button>
                  <Button size="sm" variant="outline" disabled={!selected.size || saving} onClick={() => setIgnoreIds(Array.from(selected))}>
                    Ignore selected…
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input
                          type="checkbox"
                          aria-label="Select all"
                          checked={allSelected}
                          onChange={() => setSelected(allSelected ? new Set() : new Set(invoices.map((d) => d.id)))}
                        />
                      </TableHead>
                      <TableHead className="w-8" />
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="hidden md:table-cell">PO / memo</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Support funds</TableHead>
                      <TableHead className="text-right">Decide</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((d) => (
                      <React.Fragment key={d.id}>
                        <TableRow>
                          <TableCell>
                            <input
                              type="checkbox"
                              aria-label={`Select ${d.tranid}`}
                              checked={selected.has(d.id)}
                              onChange={() => setSelected((s) => toggle(s, d.id))}
                            />
                          </TableCell>
                          <TableCell>{chevron(d)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(d.date)}</TableCell>
                          <TableCell className="text-sm">
                            {docCell(d)}
                            {suggestionNote(d)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[16rem] truncate">
                            {[d.poRef, d.memo].filter(Boolean).join(' · ') || '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(d.sales)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                            {d.supportFund ? money(d.supportFund) : '—'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Button size="sm" variant="outline" disabled={saving} onClick={() => decide([d.id], 'outside_sale')}>
                              Add to sales
                            </Button>
                            <RowMenu
                              items={[
                                { label: 'Attach to a Hub order…', onSelect: () => setAttachDoc(d) },
                                { label: 'Ignore…', onSelect: () => setIgnoreIds([d.id]) },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                        {expandRow(d, 7)}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {credits.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Credits ({credits.length})</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Attach each credit to the order it credits; it lowers that order&apos;s value. When it covers more than
                  one order, record it for the company. Support funds are never touched.
                </p>
                {credits.some((d) => quickAction(d)) && (
                  <div className="pt-2">
                    <Button size="sm" disabled={saving} onClick={() => acceptAllSuggestions(credits)}>
                      Accept NetSuite&apos;s link for {credits.filter((d) => quickAction(d)).length} credit
                      {credits.filter((d) => quickAction(d)).length === 1 ? '' : 's'}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-0 pb-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Date</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead className="hidden md:table-cell">PO / memo</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead className="text-right">Decide</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {credits.map((d) => (
                      <React.Fragment key={d.id}>
                        <TableRow>
                          <TableCell>{chevron(d)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(d.date)}</TableCell>
                          <TableCell className="text-sm">
                            {docCell(d)}
                            {suggestionNote(d)}
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground max-w-[16rem] truncate">
                            {[d.poRef, d.memo].filter(Boolean).join(' · ') || '—'}
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(d.sales)}</TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {(() => {
                              const q = quickAction(d);
                              return q ? (
                                <Button size="sm" variant="outline" disabled={saving} onClick={() => decide([d.id], q.decision, q.extra)}>
                                  {q.label}
                                </Button>
                              ) : (
                                <Button size="sm" variant="outline" disabled={saving} onClick={() => setAttachDoc(d)}>
                                  Attach…
                                </Button>
                              );
                            })()}
                            <RowMenu
                              items={[
                                ...(quickAction(d) ? [{ label: 'Attach to another order…', onSelect: () => setAttachDoc(d) }] : []),
                                { label: 'Record for the company', onSelect: () => decide([d.id], 'company_credit') },
                                { label: 'Ignore…', onSelect: () => setIgnoreIds([d.id]) },
                              ]}
                            />
                          </TableCell>
                        </TableRow>
                        {expandRow(d, 5)}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ---------------- Hub orders ---------------- */}
        <TabsContent value="orders" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Hub orders and what NetSuite billed</CardTitle>
              <p className="text-sm text-muted-foreground">
                Billed less = NetSuite invoiced less than the Hub order (an open backorder or a price difference).
                Credits attached here lower the order&apos;s value.
              </p>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {data && data.orders.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-4">No Hub orders.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead className="text-right">Hub total</TableHead>
                      <TableHead className="text-right">Billed</TableHead>
                      <TableHead>Billing</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Credits</TableHead>
                      <TableHead className="text-right hidden md:table-cell">After credits</TableHead>
                      <TableHead className="hidden lg:table-cell">NetSuite</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.orders ?? []).map((o) => (
                      <TableRow key={o.orderId}>
                        <TableCell className="text-sm font-medium">
                          <Link href={`/admin/orders/${o.orderId}`} className="hover:underline">
                            {o.poNumber || '—'}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{o.status}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{money(o.hubTotal)}</TableCell>
                        <TableCell className="text-right tabular-nums text-sm">{o.documents.length ? money(o.billed) : '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATE[o.state].variant}>{STATE[o.state].label}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                          {o.credits ? money(o.credits) : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                          {o.credits ? money(o.valueAfterCredits) : '—'}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-xs text-muted-foreground font-mono">
                          {[...o.documents, ...o.creditDocuments].join(', ') || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Decided ---------------- */}
        <TabsContent value="decided" className="pt-4">
          <Card>
            <CardContent className="px-0 py-0">
              {decided.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 py-4">No decisions yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Date</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead className="text-right">Products</TableHead>
                      <TableHead>Decision</TableHead>
                      <TableHead className="hidden md:table-cell">By</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decided.map((d) => (
                      <React.Fragment key={d.id}>
                        <TableRow>
                          <TableCell>{chevron(d)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(d.date)}</TableCell>
                          <TableCell className="text-sm">{docCell(d)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">
                            {money(d.sales)}
                            {d.creditsAttached ? (
                              <span className="block text-xs text-muted-foreground">credits {money(d.creditsAttached)}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">{decisionText(d)}</TableCell>
                          <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                            {d.review!.decidedBy ?? '—'}
                            <span className="block">{formatDateTime(d.review!.decidedAt)}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" disabled={saving} onClick={() => undo(d)}>
                              Undo
                            </Button>
                          </TableCell>
                        </TableRow>
                        {expandRow(d, 6)}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ---------------- Nothing to count ---------------- */}
        <TabsContent value="nothing" className="pt-4">
          <Card>
            <CardHeader className="pb-3">
              <p className="text-sm text-muted-foreground">
                NetSuite documents with no Qiqi products and no support funds (private label, shipping-only, $0). They
                can never count, so they need no decision.
              </p>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              {nothing.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-4">None.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>Date</TableHead>
                      <TableHead>Document</TableHead>
                      <TableHead className="text-right">Document total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {nothing.map((d) => (
                      <React.Fragment key={d.id}>
                        <TableRow>
                          <TableCell>{chevron(d)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatDate(d.date)}</TableCell>
                          <TableCell className="text-sm">{docCell(d)}</TableCell>
                          <TableCell className="text-right tabular-nums text-sm">{money(d.totalAmount)}</TableCell>
                        </TableRow>
                        {expandRow(d, 3)}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {data && (
        <AttachDialog
          doc={attachDoc}
          targets={data.attachTargets}
          saving={saving}
          onClose={() => setAttachDoc(null)}
          onConfirm={(choice: AttachChoice) => attachDoc && decide([attachDoc.id], 'attach', choice as Record<string, string>)}
        />
      )}
      <IgnoreDialog
        count={ignoreIds.length}
        saving={saving}
        onClose={() => setIgnoreIds([])}
        onConfirm={(reason) => decide(ignoreIds, 'ignore', { reason })}
      />
    </div>
  );
}

function RowMenu({ items }: { items: Array<{ label: string; onSelect: () => void }> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="ml-1 px-2" aria-label="More decisions">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((i) => (
          <DropdownMenuItem key={i.label} onSelect={i.onSelect}>
            {i.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground truncate">{sub}</p>}
    </Card>
  );
}
