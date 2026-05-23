'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { EmptyState } from '../../components/qq/empty-state';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../../components/qq/dialog';
import { Input } from '../../components/qq/input';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';

interface Product {
  id: number;
  item_name: string;
  picture_url?: string;
  category?: { name: string } | null;
}

interface HighlightedProduct {
  id: string;
  product_id: number;
  is_new: boolean;
  display_order: number;
  product: Product;
}

export default function HighlightedProductsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [highlighted, setHighlighted] = useState<HighlightedProduct[]>([]);
  const [available, setAvailable] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSelector, setShowSelector] = useState(false);
  const [selectorQuery, setSelectorQuery] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [highlightedRes, productsRes] = await Promise.all([
        supabase
          .from('highlighted_products')
          .select(`*, product:"Products"(id, item_name, picture_url, category:categories(name))`)
          .order('display_order', { ascending: true }),
        supabase
          .from('Products')
          .select(`id, item_name, picture_url, category:categories(name)`)
          .order('item_name', { ascending: true }),
      ]);
      if (highlightedRes.error) throw highlightedRes.error;
      if (productsRes.error) throw productsRes.error;

      const hp = highlightedRes.data || [];
      setHighlighted(hp as HighlightedProduct[]);
      const highlightedIds = new Set(hp.map((h: any) => h.product_id));
      setAvailable(
        (productsRes.data || [])
          .filter((p: any) => !highlightedIds.has(p.id))
          .map((p: any) => ({
            ...p,
            category: Array.isArray(p.category) ? p.category[0] : p.category,
          }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addProduct = async (productId: number) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');
      const nextOrder = Math.max(-1, ...highlighted.map((h) => h.display_order)) + 1;
      const { error } = await supabase
        .from('highlighted_products')
        .insert({ product_id: productId, display_order: nextOrder, created_by: user.id });
      if (error) throw error;
      toast.success('Product highlighted.');
      setShowSelector(false);
      setSelectorQuery('');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to highlight product.');
    }
  };

  const removeProduct = async (hp: HighlightedProduct) => {
    const ok = await confirm({
      title: 'Remove highlighted product?',
      description: `Remove "${hp.product?.item_name || 'this product'}" from the dashboard highlights.`,
      variant: 'danger',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('highlighted_products').delete().eq('id', hp.id);
      if (error) throw error;
      toast.success('Removed.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove.');
    }
  };

  const toggleNew = async (hp: HighlightedProduct) => {
    try {
      const { error } = await supabase
        .from('highlighted_products')
        .update({ is_new: !hp.is_new })
        .eq('id', hp.id);
      if (error) throw error;
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update.');
    }
  };

  const moveProduct = async (hp: HighlightedProduct, direction: 'up' | 'down') => {
    const currentIndex = highlighted.findIndex((h) => h.id === hp.id);
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= highlighted.length) return;
    const target = highlighted[newIndex];
    try {
      await supabase
        .from('highlighted_products')
        .update({ display_order: target.display_order })
        .eq('id', hp.id);
      await supabase
        .from('highlighted_products')
        .update({ display_order: hp.display_order })
        .eq('id', target.id);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reorder.');
    }
  };

  const filteredAvailable = available.filter((p) =>
    p.item_name.toLowerCase().includes(selectorQuery.toLowerCase())
  );

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Highlighted products"
        description="Products shown in the rotating banner on client dashboards. Use NEW to flag fresh releases."
        actions={
          <Button size="sm" onClick={() => setShowSelector(true)} disabled={loading}>
            <Plus className="h-4 w-4" /> Add product
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <p className="text-sm text-muted-foreground py-4">Loading…</p>
          ) : highlighted.length === 0 ? (
            <EmptyState
              title="No highlighted products yet"
              description="Add a product to feature it on the client dashboard banner."
              action={
                <Button size="sm" onClick={() => setShowSelector(true)}>
                  <Plus className="h-4 w-4" /> Add product
                </Button>
              }
              className="border-0 shadow-none"
            />
          ) : (
            <ul className="space-y-2">
              {highlighted.map((hp, index) => (
                <li
                  key={hp.id}
                  className="flex items-center gap-3 p-3 border border-border rounded-md bg-background"
                >
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveProduct(hp, 'up')}
                      disabled={index === 0}
                      className="h-6 w-6"
                      aria-label="Move up"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => moveProduct(hp, 'down')}
                      disabled={index === highlighted.length - 1}
                      className="h-6 w-6"
                      aria-label="Move down"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {hp.product?.picture_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={hp.product.picture_url}
                      alt={hp.product.item_name}
                      className="h-12 w-12 rounded object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded border border-border bg-muted/50 shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {hp.product?.item_name || 'Unknown product'}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {hp.product?.category?.name || 'No category'}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                    <input
                      type="checkbox"
                      checked={hp.is_new}
                      onChange={() => toggleNew(hp)}
                      className="h-4 w-4 accent-foreground"
                    />
                    <span className="text-xs font-medium">NEW</span>
                  </label>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeProduct(hp)}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={showSelector} onOpenChange={setShowSelector}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Select a product to highlight</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Input
              value={selectorQuery}
              onChange={(e) => setSelectorQuery(e.target.value)}
              placeholder="Search products…"
              autoFocus
            />
            {filteredAvailable.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {available.length === 0
                  ? 'All products are already highlighted.'
                  : 'No products match the search.'}
              </p>
            ) : (
              <ul className="max-h-[50vh] overflow-auto space-y-1.5">
                {filteredAvailable.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => addProduct(p.id)}
                    className="flex items-center gap-3 p-2.5 border border-border rounded-md cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    {p.picture_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.picture_url}
                        alt={p.item_name}
                        className="h-10 w-10 rounded object-cover border border-border"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded border border-border bg-muted/50" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{p.item_name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {p.category?.name || 'No category'}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
