'use client';

/**
 * Price list arrangement — the flat sequence partners see on /client/price-list
 * and its PDF. Same drag mechanics as the products page, writing the same
 * shared Products.sort_order: the catalog shows this sequence grouped by
 * category, the price list shows it as-is.
 */

import { useEffect, useState } from 'react';
import { Search, GripVertical } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatCurrency } from '../../../lib/formatters';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
import { Input } from '../../components/qq/input';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { Badge } from '../../components/qq/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/qq/table';
import { useToast } from '../../components/ui/ToastProvider';

interface Product {
  id: number;
  item_name: string | null;
  sku: string | null;
  case_pack: number | null;
  price_international: number | null;
  price_americas: number | null;
  salon_price: number | null;
  msrp: number | null;
  enable: boolean;
  visible_to_americas: boolean | null;
  visible_to_international: boolean | null;
  sort_order?: number | null;
  category?: { name: string } | null;
}

export default function PriceListOrderPage() {
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('Products')
        .select(
          'id, item_name, sku, case_pack, price_international, price_americas, salon_price, msrp, enable, visible_to_americas, visible_to_international, sort_order, category:categories(name)'
        )
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('item_name', { ascending: true });
      if (err) throw err;
      setProducts((data as unknown as Product[]) || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // -------- Drag/drop reorder (same mechanics as the products page) --------
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleDrop = async (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      return;
    }
    try {
      const next = [...products];
      const fromIdx = next.findIndex((p) => p.id === draggedId);
      const toIdx = next.findIndex((p) => p.id === targetId);
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const reordered = next.map((p, i) => ({ ...p, sort_order: i + 1 }));
      setProducts(reordered);
      // Per-row UPDATEs, not upsert: upsert's INSERT stage must satisfy every
      // NOT NULL column (case_pack has no default since the 2026-08
      // constraint), so partial-row upserts started violating it.
      const results = await Promise.all(
        reordered.map((p) =>
          supabase.from('Products').update({ sort_order: p.sort_order }).eq('id', p.id),
        ),
      );
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;
    } catch (err: any) {
      toast.error(err.message || 'Failed to save order.');
      fetchData();
    } finally {
      setDraggedId(null);
    }
  };

  const q = search.trim().toLowerCase();
  const visible = q
    ? products.filter(
        (p) =>
          (p.item_name ?? '').toLowerCase().includes(q) ||
          (p.sku ?? '').toLowerCase().includes(q)
      )
    : products;

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Price List"
        description="Drag rows to set the order partners see on their price list and PDF. This is the catalog sequence — the Products page shows the same order grouped by category."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading catalog…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Case Pack</TableHead>
                  <TableHead className="text-right">Americas (USD)</TableHead>
                  <TableHead className="text-right">International (USD)</TableHead>
                  <TableHead className="text-right">Salon (USD)</TableHead>
                  <TableHead className="text-right">MSRP (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((p) => (
                  <TableRow
                    key={p.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, p.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, p.id)}
                    className={`cursor-move ${draggedId === p.id ? 'opacity-50' : ''} ${
                      p.enable ? '' : 'opacity-60'
                    }`}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <GripVertical className="h-3.5 w-3.5" />
                        {products.indexOf(p) + 1}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      <span className="inline-flex items-center gap-2">
                        {p.item_name || p.sku || '—'}
                        {!p.enable && <Badge variant="muted">Disabled</Badge>}
                        {p.enable && p.visible_to_americas === false && (
                          <Badge variant="outline">Intl only</Badge>
                        )}
                        {p.enable && p.visible_to_international === false && (
                          <Badge variant="outline">Americas only</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.category?.name ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.case_pack ?? '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.price_americas ? formatCurrency(p.price_americas) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.price_international ? formatCurrency(p.price_international) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {p.salon_price ? formatCurrency(p.salon_price) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {p.msrp ? (
                        <span className="font-mono">{formatCurrency(p.msrp)}</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Pro use</span>
                      )}
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
