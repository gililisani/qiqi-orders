'use client';

/**
 * Price list — the caller sees THEIR price: the company's pricing tier
 * (explicit on the company, else Americas/International from its class —
 * the same rule the order pricing uses), plus the suggested resale prices
 * ABOVE their tier only. A company priced at Salon never sees distributor
 * or salon columns — "his pricing and nothing else" (owner 2026-10-05).
 * On-screen table + a designed on-the-fly PDF that can never go stale.
 */

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../lib/formatters';
import { effectivePriceTier, priceForTier, type PriceTier } from '../../../lib/orderPricing';
import type { PriceListRow } from '../../../lib/pdf/components/PriceListDocument';

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

interface ProductRow {
  item_name: string | null;
  sku: string | null;
  case_pack: number | null;
  price_international: number | null;
  price_americas: number | null;
  salon_price: number | null;
  msrp: number | null;
  visible_to_americas: boolean | null;
  visible_to_international: boolean | null;
}

export default function ClientPriceListPage() {
  const [rows, setRows] = useState<PriceListRow[]>([]);
  const [tier, setTier] = useState<PriceTier | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Not authenticated.');

        // Region = the company's class (RLS: own company + its linked class).
        const { data: client } = await supabase
          .from('clients')
          .select('company:companies(price_tier, class:classes(name))')
          .eq('id', user.id)
          .single();
        const companyRaw: any = Array.isArray(client?.company)
          ? client?.company?.[0]
          : client?.company;
        const classRaw = Array.isArray(companyRaw?.class)
          ? companyRaw?.class?.[0]
          : companyRaw?.class;
        const className: string | null = classRaw?.name ?? null;

        const { data: products, error: err } = await supabase
          .from('Products')
          .select(
            'item_name, sku, case_pack, price_international, price_americas, salon_price, msrp, sort_order, visible_to_americas, visible_to_international'
          )
          .eq('enable', true)
          .order('sort_order', { ascending: true, nullsFirst: false });
        if (err) throw err;

        // Region (product visibility) still follows the class — tolerant
        // match, never strict-equal. The PRICE follows the pricing tier.
        const isAmericas = (className || '').toLowerCase().includes('america');
        const companyTier = effectivePriceTier({
          priceTier: companyRaw?.price_tier ?? null,
          className,
        });
        setTier(companyTier);

        setRows(
          ((products as unknown as ProductRow[]) || [])
            // Only the products visible to the caller's region — the list
            // must match what they can actually order.
            .filter((p) =>
              isAmericas ? p.visible_to_americas !== false : p.visible_to_international !== false,
            )
            // Not priced at their tier = not orderable by them = not listed.
            .filter((p) => priceForTier(companyTier, p) !== null)
            .map((p) => ({
              name: p.item_name || p.sku || '—',
              casePack: p.case_pack,
              distributor: priceForTier(companyTier, p),
              salon: p.salon_price,
              msrp: p.msrp,
            })),
        );
      } catch (err: any) {
        setError(err.message || 'Failed to load the price list.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Only resale prices above the company's own tier are shown.
  const showSalon = tier === 'americas' || tier === 'international';
  const showMsrp = tier !== null && tier !== 'msrp';

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const [{ pdf }, React, { PriceListDocument, registerPriceListFonts }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('react'),
        import('../../../lib/pdf/components/PriceListDocument'),
      ]);
      const origin = window.location.origin;
      registerPriceListFonts(origin);
      const generatedAt = new Date().toISOString();
      const blob = await pdf(
        React.createElement(PriceListDocument, {
          rows,
          showSalon,
          showMsrp,
          generatedAt,
          logoUrl: `${origin}/logo.png`,
          taglineUrl: `${origin}/Qiqi_Tagline_Black.png`,
        }) as any
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
        description={
          tier === null
            ? undefined
            : showSalon
            ? 'Your distributor prices with suggested salon and retail pricing — always current.'
            : showMsrp
              ? 'Your prices with suggested retail pricing — always current.'
              : 'Your prices — always current.'
        }
        actions={
          <Button
            size="sm"
            onClick={handleDownload}
            loading={downloading}
            disabled={loading || rows.length === 0}
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
                  <TableHead className="text-right">Case Pack</TableHead>
                  <TableHead className="text-right">Distributor (USD)</TableHead>
                  {showSalon && <TableHead className="text-right">Salon (USD)</TableHead>}
                  {showMsrp && <TableHead className="text-right">MSRP (USD)</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {r.casePack ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {r.distributor ? formatCurrency(r.distributor) : '—'}
                    </TableCell>
                    {showSalon && (
                      <TableCell className="text-right font-mono text-sm">
                        {r.salon ? formatCurrency(r.salon) : '—'}
                      </TableCell>
                    )}
                    {showMsrp && (
                      <TableCell className="text-right text-sm">
                        {r.msrp ? (
                          <span className="font-mono">{formatCurrency(r.msrp)}</span>
                        ) : (
                          <span className="text-muted-foreground text-xs">Pro use</span>
                        )}
                      </TableCell>
                    )}
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
