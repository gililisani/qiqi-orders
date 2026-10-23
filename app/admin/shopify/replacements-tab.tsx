'use client';

/**
 * Replacements tab (owner 2026-10-23): Shopify orders tagged "Replacement"
 * or noted "Replacement for #7369 – damaged". Shows what each replaces, the
 * original order at the root of the chain, why, and the cost of the goods
 * shipped (NetSuite COGS) — the record for carrier / 3PL claims.
 */

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/qq/table';
import { Badge } from '../../components/qq/badge';
import { Pagination } from '../../components/qq/pagination';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

const PAGE = 20;
const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

interface Replacement {
  shopifyOrderId: string;
  orderName: string;
  createdAt: string;
  forOrder: string | null;
  rootOrder: string | null;
  reason: string | null;
  items: string[];
  status: 'shipped' | 'waiting' | 'cancelled' | 'error';
  costCents: number | null;
  fulfillmentLinks: string[];
}

const STATUS: Record<Replacement['status'], { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  shipped: { label: 'shipped', variant: 'success' },
  waiting: { label: 'waiting to ship', variant: 'warning' },
  cancelled: { label: 'cancelled', variant: 'muted' },
  error: { label: 'sync error', variant: 'destructive' },
};

export function ReplacementsTab() {
  const [rows, setRows] = useState<Replacement[] | null>(null);
  const [adminBase, setAdminBase] = useState<string | null>(null);
  const [costWarning, setCostWarning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/shopify/sync/replacements');
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setRows(j.replacements);
        setAdminBase(j.shopifyAdminBase);
        setCostWarning(j.costWarning);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    })();
  }, []);

  const list = rows ?? [];
  const slice = list.slice((page - 1) * PAGE, page * PAGE);
  const shippedCost = list.reduce((s, r) => s + (r.costCents ?? 0), 0);
  const orderLink = (name: string, id?: string) =>
    adminBase && id ? (
      <a href={`${adminBase}/orders/${id}`} target="_blank" rel="noreferrer" className="text-brand-periwinkle hover:underline">
        {name}
      </a>
    ) : adminBase ? (
      // Order replaced is known by name only — search the Shopify admin for it.
      <a
        href={`${adminBase}/orders?query=${encodeURIComponent(name)}`}
        target="_blank"
        rel="noreferrer"
        className="text-brand-periwinkle hover:underline"
      >
        {name}
      </a>
    ) : (
      <span>{name}</span>
    );

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Replacements</CardTitle>
          {list.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {list.length} replacement{list.length === 1 ? '' : 's'} · goods shipped {money(shippedCost)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Orders tagged <span className="font-medium">Replacement</span> or noted “Replacement for #1234 – reason”. A $0
          replacement reaches NetSuite once it ships; cancelled before shipping, it never does.
        </p>
      </CardHeader>
      <CardContent>
        {err ? (
          <p className="text-sm text-muted-foreground">Unavailable right now: {err}</p>
        ) : rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">No replacement orders yet.</p>
        ) : (
          <>
            {costWarning && <p className="mb-3 text-xs text-muted-foreground">{costWarning}</p>}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Replacement</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Replaces</TableHead>
                  <TableHead>Original order</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Cost of goods</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slice.map((r) => (
                  <TableRow key={r.shopifyOrderId}>
                    <TableCell className="font-medium">{orderLink(r.orderName, r.shopifyOrderId)}</TableCell>
                    <TableCell className="text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell>{r.forOrder ? orderLink(r.forOrder) : <span className="text-muted-foreground">not noted</span>}</TableCell>
                    <TableCell>{r.rootOrder && r.rootOrder !== r.forOrder ? orderLink(r.rootOrder) : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="max-w-56 text-sm">{r.reason ?? <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.items.join(', ')}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.costCents != null ? (
                        <span className="inline-flex items-center gap-1">
                          {money(r.costCents)}
                          {r.fulfillmentLinks.map((href, i) => (
                            <a key={href} href={href} target="_blank" rel="noreferrer" className="text-brand-periwinkle" title={`NetSuite fulfillment ${i + 1}`}>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {list.length > PAGE && (
              <Pagination
                className="mt-3"
                page={page}
                totalPages={Math.ceil(list.length / PAGE)}
                totalItems={list.length}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
