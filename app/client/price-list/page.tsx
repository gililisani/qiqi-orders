'use client';

/**
 * Price list — on-screen table + on-the-fly PDF download. One module for
 * every partner: both regions' distributor prices, straight from the
 * catalog, so it can never be out of date.
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../lib/formatters';
import type { PriceListProduct } from '../../../lib/pdf/components/PriceListDocument';

import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/qq/table';

export default function ClientPriceListPage() {
  const [products, setProducts] = useState<PriceListProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('Products')
          .select('item_name, sku, price_international, price_americas, sort_order')
          .eq('enable', true)
          .order('sort_order', { ascending: true, nullsFirst: false });
        if (err) throw err;
        setProducts((data as PriceListProduct[]) || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load the price list.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const [{ pdf }, React, { PriceListDocument }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('../../../lib/pdf/components/PriceListDocument'),
      ]);
      const generatedAt = new Date().toISOString();
      const blob = await pdf(
        React.createElement(PriceListDocument, { products, generatedAt }) as any
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Qiqi-Price-List-${generatedAt.slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError('Failed to generate the PDF: ' + (err.message || 'unknown error'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Price list"
        description="Current distributor prices, always up to date."
        actions={
          <Button
            size="sm"
            onClick={handleDownload}
            loading={downloading}
            disabled={loading || products.length === 0}
          >
            <Download className="h-4 w-4" />
            {downloading ? 'Generating…' : 'Download PDF'}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading catalog…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden sm:table-cell">SKU</TableHead>
                  <TableHead className="text-right">International (USD)</TableHead>
                  <TableHead className="text-right">Americas (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{p.item_name || '—'}</TableCell>
                    <TableCell className="hidden sm:table-cell font-mono text-xs">
                      {p.sku || '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(p.price_international) > 0
                        ? formatCurrency(Number(p.price_international))
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {Number(p.price_americas) > 0
                        ? formatCurrency(Number(p.price_americas))
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
