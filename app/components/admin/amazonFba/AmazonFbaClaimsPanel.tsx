'use client';

/**
 * Claimable losses panel — lost/damaged units Amazon hasn't reimbursed,
 * inside the 60-day claim window. Reads the weekly snapshot; Refresh
 * recomputes live from Amazon (takes a minute or two — two reports must
 * generate). Quiet when there's nothing to claim. Filing stays manual in
 * Seller Central (no Amazon API for claims).
 */

import { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../qq/card';
import { Button } from '../../qq/button';
import { Badge } from '../../qq/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../qq/table';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { useToast } from '../../ui/ToastProvider';
import type { ClaimsSnapshot } from '../../../../lib/amazonFba/claimableLosses';

const SELLER_CENTRAL_REIMBURSEMENTS =
  'https://sellercentral.amazon.com/gp/payments-account/reimbursements.html';

export function AmazonFbaClaimsPanel() {
  const toast = useToast();
  const [snapshot, setSnapshot] = useState<ClaimsSnapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/netsuite/amazon-fba/claims');
        const j = await res.json();
        if (res.ok) setSnapshot(j.snapshot);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetchWithAuth('/api/netsuite/amazon-fba/claims', { method: 'POST' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Refresh failed.');
      setSnapshot(j.snapshot);
      toast.success('Claimable losses recomputed from Amazon.');
    } catch (e: any) {
      toast.error(e.message || 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">
          Claimable losses
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            lost/damaged at Amazon, not reimbursed — 60-day claim window
            {snapshot ? ` · checked ${new Date(snapshot.computedAt).toLocaleDateString()}` : ''}
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {snapshot && snapshot.rows.length > 0 && (
            <a href={SELLER_CENTRAL_REIMBURSEMENTS} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm">
                File in Seller Central <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </a>
          )}
          <Button variant="outline" size="sm" onClick={refresh} loading={refreshing}>
            <RefreshCw className="h-3.5 w-3.5" />
            {refreshing ? 'Checking Amazon… (1–2 min)' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !snapshot ? (
          <p className="text-sm text-muted-foreground">
            No check has run yet — the weekly job runs Mondays, or hit Refresh.
          </p>
        ) : snapshot.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to claim — every lost/damaged unit in the window is found or reimbursed. ✓
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Lost</TableHead>
                <TableHead className="text-right">Damaged</TableHead>
                <TableHead className="text-right">Found</TableHead>
                <TableHead className="text-right">Reimbursed</TableHead>
                <TableHead className="text-right">Claimable</TableHead>
                <TableHead>Window</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.rows.map((r) => (
                <TableRow key={r.sku}>
                  <TableCell className="text-sm">
                    <span className="font-mono">{r.sku}</span>
                    {r.title && (
                      <span className="ml-2 text-xs text-muted-foreground">{r.title.slice(0, 40)}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.lost || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.damaged || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.found || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{r.reimbursed || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold">
                    {r.outstanding}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.daysLeft <= 10 ? 'destructive' : 'warning'}>
                      {r.daysLeft}d left
                    </Badge>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      since {new Date(`${r.oldestEventDate}T00:00:00Z`).toLocaleDateString()}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {loaded && snapshot && snapshot.unknownReasons.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Unrecognized ledger adjustments (not counted — tell the agent to classify):{' '}
            {snapshot.unknownReasons
              .map((u) => `${u.reason} (${u.count}×, ${u.qty > 0 ? '+' : ''}${u.qty})`)
              .join(' · ')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
