'use client';

/**
 * An invoice billed externally (NetSuite), approved by Qiqi on the NetSuite
 * review page — read-only: date, products, total, support funds (the
 * invoice's discount) and any credits. It counts toward the client's sales
 * like a Hub order.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';

import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { formatCurrency, formatDate } from '../../../../../lib/formatters';
import { PageHeader } from '../../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/qq/card';
import { Badge } from '../../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/qq/table';

interface Line {
  sku: string | null;
  name: string | null;
  quantity: number;
  amount: number;
}

interface Sale {
  invoiceNumber: string;
  date: string;
  total: number;
  supportFund: number;
  products: Line[];
  credits: Array<{ id: string; number: string; date: string; amount: number; products: Line[] }>;
}

const money = (n: number) => (n < 0 ? `−${formatCurrency(-n)}` : formatCurrency(n));

export default function ExternalSalePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const [sale, setSale] = useState<Sale | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/client/external-sales/${id}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load.');
        setSale(json.sale);
      } catch (err: any) {
        setError(err.message);
      }
    })();
  }, [id]);

  const creditTotal = (sale?.credits ?? []).reduce((s, c) => s + c.amount, 0);

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link href="/client/orders" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4 mr-1" /> Orders
        </Link>
      </div>
      <PageHeader
        title={sale ? `Invoice ${sale.invoiceNumber}` : 'Invoice'}
        description={sale ? `Billed on ${formatDate(sale.date)}, outside the Hub. It counts toward your sales like any order.` : undefined}
        actions={<Badge variant="outline">Billed Externally</Badge>}
      />
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!sale && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {sale && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Products</CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sale.products.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm">
                        <span className="font-mono">{p.sku || '—'}</span>
                        {p.name && p.name !== p.sku && <span className="text-muted-foreground"> · {p.name}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{p.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm">{p.amount === 0 ? 'Free' : money(p.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6 space-y-2 text-sm">
              <Row label="Total (products)" value={money(sale.total)} strong />
              <Row label="Support funds used" value={sale.supportFund ? money(sale.supportFund) : '—'} />
              {sale.credits.map((c) => (
                <div key={c.id}>
                  <Row label={`Credit ${c.number} · ${formatDate(c.date)}`} value={money(c.amount)} />
                  <ul className="mt-0.5 ml-4 space-y-0.5 text-xs text-muted-foreground">
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
              {sale.credits.length > 0 && <Row label="Total after credits" value={money(sale.total + creditTotal)} strong />}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 ${strong ? 'font-medium' : ''}`}>
      <span className={strong ? '' : 'text-muted-foreground'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
