'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatDate } from '../../../lib/formatters';
import { Card, CardContent } from '../../components/qq/card';
import { Input } from '../../components/qq/input';
import { Badge } from '../../components/qq/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/qq/table';
import { money } from './format';

interface Coding {
  account_name: string | null;
  department_name: string | null;
  class_name: string | null;
  location_name: string | null;
  taxcode_name: string | null;
  item_based: boolean;
  share: number;
}

interface VendorProfile {
  ns_vendor_id: string;
  vendor_name: string;
  subsidiary_name: string | null;
  currency: string | null;
  codings: Coding[];
  payment_account_name: string | null;
  memo_label: string | null;
  bill_count: number;
  consistency: number | null;
  amount_median: number | null;
  last_bill_date: string | null;
  source: 'history' | 'manual';
}

/** "622010 Website development · Marketing · VAT: ILT - VAT on Purchases IL" */
const describe = (c: Coding | undefined) =>
  c
    ? [c.account_name, c.department_name, c.class_name, c.location_name, c.taxcode_name ? `VAT: ${c.taxcode_name}` : null]
        .filter(Boolean)
        .join(' · ')
    : '—';

export function VendorsTab() {
  const [vendors, setVendors] = useState<VendorProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetchWithAuth('/api/ap/vendors');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load.');
        setVendors(json.vendors);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors ?? []).filter((v) => !q || v.vendor_name.toLowerCase().includes(q) || (v.memo_label ?? '').toLowerCase().includes(q));
  }, [vendors, search]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          How each vendor is booked, learned from its past bills in NetSuite. Bills are proposed the same way.
        </p>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendors" aria-label="Search vendors" className="h-9 pl-9" />
        </div>
      </div>
      <Card>
        <CardContent className="pt-6">
          {error ? (
            <p className="text-sm text-muted-foreground">Unavailable right now: {error}</p>
          ) : vendors === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : vendors.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No vendors learned yet — run “Learn from NetSuite” in Settings.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Bills</TableHead>
                  <TableHead>Booked as</TableHead>
                  <TableHead>Paid from</TableHead>
                  <TableHead className="text-right">Usual amount</TableHead>
                  <TableHead>Last bill</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((v) => {
                  const top = v.codings[0];
                  const same = v.consistency === 1 && v.bill_count >= 2;
                  return (
                    <TableRow key={v.ns_vendor_id}>
                      <TableCell>
                        <div className="font-medium">{v.vendor_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[v.subsidiary_name, v.currency, v.memo_label ? `memo “${v.memo_label} MM.YY”` : null].filter(Boolean).join(' · ')}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{v.bill_count}</TableCell>
                      <TableCell className="max-w-96 text-sm">
                        <div>{describe(top)}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {same ? (
                            <Badge variant="success">Same every time</Badge>
                          ) : v.codings.length > 1 ? (
                            <Badge variant="warning">{v.codings.length} ways — latest shown</Badge>
                          ) : null}
                          {top?.item_based && <Badge variant="muted">Item lines</Badge>}
                          {v.source === 'manual' && <Badge variant="accent">Edited</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{v.payment_account_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(v.amount_median, v.currency)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDate(v.last_bill_date)}</TableCell>
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
