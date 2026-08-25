'use client';

/** Affirm remittances (last 90 days, live from the Affirm API) for the Payouts tab. */
import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/qq/table';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

interface Remittance { deposit_id: string; issued_at: string; sales_cents: number; refunds_cents: number; fee_cents: number; net_cents: number; events: number }

const money = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

export function AffirmRemittances() {
  const [rows, setRows] = useState<Remittance[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/shopify/sync/affirm-remittances');
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
        setRows(j.remittances);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    })();
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Affirm remittances (90 days)</CardTitle>
      </CardHeader>
      <CardContent>
        {err ? (
          <p className="text-sm text-muted-foreground">Affirm API unavailable right now: {err}</p>
        ) : rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No Affirm deposits in the last 90 days.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Deposit</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Refunds</TableHead>
                <TableHead className="text-right">Fees</TableHead>
                <TableHead className="text-right">Net to bank</TableHead>
                <TableHead className="text-right">Loans</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.deposit_id}>
                  <TableCell className="font-mono text-xs">{r.deposit_id}</TableCell>
                  <TableCell>{new Date(r.issued_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.sales_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.refunds_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{money(r.fee_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{money(r.net_cents)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.events}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
