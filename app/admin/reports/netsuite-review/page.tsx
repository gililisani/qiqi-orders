'use client';

/**
 * NetSuite review — overview. Per company: NetSuite invoices and credits
 * still waiting for a decision, how many are decided, and the last sync.
 * Each row opens that company's review page.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { formatCurrency, formatDateTime } from '../../../../lib/formatters';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent } from '../../../components/qq/card';
import { Badge } from '../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../components/qq/table';

interface Row {
  companyId: string;
  name: string;
  toReviewInvoices: number;
  toReviewCredits: number;
  toReviewAmount: number;
  decided: number;
  documents: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const money = (n: number) => (n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(n));

export default function NetSuiteReviewOverviewPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/sales-ledger/review-summary');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load.');
        const list: Row[] = json.companies ?? [];
        list.sort((a, b) => b.toReviewInvoices + b.toReviewCredits - (a.toReviewInvoices + a.toReviewCredits) || a.name.localeCompare(b.name));
        setRows(list);
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, []);

  const waiting = (rows ?? []).reduce((s, r) => s + r.toReviewInvoices + r.toReviewCredits, 0);

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link href="/admin/reports" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" /> Reports
        </Link>
      </div>
      <PageHeader
        title="NetSuite review"
        description={rows ? `${waiting} NetSuite document${waiting === 1 ? '' : 's'} waiting for a decision` : undefined}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-muted-foreground">
        Nothing from NetSuite counts toward a client&apos;s sales until an admin decides on it. Open a company to review
        its invoices and credits.
      </p>
      <Card>
        <CardContent className="px-0 py-0">
          {!rows && !error ? (
            <p className="text-sm text-muted-foreground px-6 py-4">Loading…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead className="text-right">Invoices to review</TableHead>
                  <TableHead className="text-right">Credits to review</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Products waiting</TableHead>
                  <TableHead className="text-right hidden md:table-cell">Decided</TableHead>
                  <TableHead className="hidden lg:table-cell">Last sync</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((r) => {
                  const done = r.toReviewInvoices + r.toReviewCredits === 0;
                  return (
                    <TableRow key={r.companyId}>
                      <TableCell className="text-sm font-medium">
                        <Link href={`/admin/companies/${r.companyId}/sales`} className="hover:underline">
                          {r.name}
                        </Link>
                        {done && r.documents > 0 && (
                          <Badge variant="success" className="ml-2">
                            Reviewed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.toReviewInvoices || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{r.toReviewCredits || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">
                        {done ? '—' : money(r.toReviewAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden md:table-cell">{r.decided || '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {r.lastError ? <span className="text-destructive">Failed: {r.lastError}</span> : r.lastSyncedAt ? formatDateTime(r.lastSyncedAt) : 'Not synced'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
