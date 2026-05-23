'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Check,
  X,
  CircleDollarSign,
  Gift,
  Upload,
  Plus,
  Search,
  GripVertical,
  Edit,
  Trash2,
} from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { EmptyState } from '../../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/qq/table';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';

interface Category {
  id: number;
  name: string;
  sort_order: number;
  image_url?: string;
}

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  qualifies_for_credit_earning: boolean;
  picture_url?: string;
  sort_order?: number;
  category_id?: number;
  category?: Category;
}

export default function ProductsPage() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catRes, prodRes] = await Promise.all([
        supabase.from('categories').select('*').order('sort_order', { ascending: true }),
        supabase
          .from('Products')
          .select('*, category:categories(*)')
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('item_name', { ascending: true }),
      ]);
      if (catRes.error) throw catRes.error;
      if (prodRes.error) throw prodRes.error;
      setCategories(catRes.data || []);
      setProducts(prodRes.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // -------- Category assign --------
  const handleCategoryChange = async (productId: number, categoryId: number | null) => {
    try {
      const { error } = await supabase
        .from('Products')
        .update({ category_id: categoryId })
        .eq('id', productId);
      if (error) throw error;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                category_id: categoryId || undefined,
                category: categoryId ? categories.find((c) => c.id === categoryId) : undefined,
              }
            : p
        )
      );
    } catch (err: any) {
      toast.error(err.message || 'Failed to update category.');
    }
  };

  // -------- Delete --------
  const handleDelete = async (p: Product) => {
    const ok = await confirm({
      title: 'Delete product?',
      description: `Permanently delete "${p.item_name}". This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('Products').delete().eq('id', p.id);
      if (error) throw error;
      toast.success('Product deleted.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete product.');
    }
  };

  // -------- Drag/drop reorder --------
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
      const updates = reordered.map((p) => ({ id: p.id, sort_order: p.sort_order }));
      const { error } = await supabase.from('Products').upsert(updates, { onConflict: 'id' });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message || 'Failed to save order.');
      fetchData();
    } finally {
      setDraggedId(null);
    }
  };

  // -------- Group by category --------
  const groupedAndFiltered = (() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? products.filter(
          (p) =>
            (p.item_name ?? '').toLowerCase().includes(q) ||
            (p.sku ?? '').toLowerCase().includes(q)
        )
      : products;

    const groups = new Map<string, { category: Category | null; items: Product[] }>();
    for (const p of filtered) {
      const key = p.category
        ? `${p.category.sort_order}-${p.category.id}`
        : 'zzz-no-category';
      if (!groups.has(key)) {
        groups.set(key, { category: p.category ?? null, items: [] });
      }
      groups.get(key)!.items.push(p);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  })();

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Products"
        description="Catalog managed here. Drag rows within a category to reorder."
        actions={
          <>
            <Link href="/admin/products/bulk-upload">
              <Button variant="outline" size="sm">
                <Upload className="h-4 w-4" /> Bulk upload
              </Button>
            </Link>
            <Link href="/admin/products/new">
              <Button size="sm">
                <Plus className="h-4 w-4" /> Add product
              </Button>
            </Link>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="max-w-sm">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading products…</p>
      ) : products.length === 0 ? (
        <Card>
          <EmptyState
            title="No products yet"
            description="Add your first product to start building the catalog."
            action={
              <Link href="/admin/products/new">
                <Button size="sm">
                  <Plus className="h-4 w-4" /> Add product
                </Button>
              </Link>
            }
            className="border-0 shadow-none"
          />
        </Card>
      ) : groupedAndFiltered.length === 0 ? (
        <Card>
          <EmptyState
            title="No results"
            description="Try a different search."
            action={
              <Button size="sm" variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            }
            className="border-0 shadow-none"
          />
        </Card>
      ) : (
        groupedAndFiltered.map((group) => (
          <Card key={group.category?.id || 'no-category'}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-3">
                  {group.category?.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={group.category.image_url}
                      alt={group.category.name}
                      className="h-6 w-auto"
                    />
                  )}
                  <span>{group.category?.name || 'No category'}</span>
                  <span className="text-xs text-muted-foreground font-normal">
                    {group.items.length} {group.items.length === 1 ? 'product' : 'products'}
                  </span>
                </CardTitle>
                {group.category && (
                  <Link
                    href={`/admin/categories/${group.category.id}/edit`}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Edit category
                  </Link>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 sm:p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead className="w-16">Image</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="hidden sm:table-cell">SKU</TableHead>
                    <TableHead className="hidden md:table-cell">Americas</TableHead>
                    <TableHead className="hidden md:table-cell">International</TableHead>
                    <TableHead className="hidden lg:table-cell text-center w-32">Status</TableHead>
                    <TableHead className="hidden xl:table-cell w-40">Category</TableHead>
                    <TableHead className="w-20 text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.items.map((p, i) => (
                    <TableRow
                      key={p.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, p.id)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, p.id)}
                      onClick={() => router.push(`/admin/products/${p.id}`)}
                      className={`cursor-pointer ${draggedId === p.id ? 'opacity-50' : ''}`}
                    >
                      <TableCell>
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-muted-foreground font-mono text-[10px] shrink-0 w-6 text-right">
                            {p.sort_order || i + 1}
                          </span>
                          <span className="text-sm font-medium truncate">
                            {p.item_name || 'Unnamed'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs break-all max-w-[120px]">
                        {p.sku}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                        ${(p.price_americas || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell font-mono text-sm">
                        ${(p.price_international || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center justify-center gap-1.5">
                          <StatusDot
                            active={p.enable}
                            activeIcon={<Check className="h-3.5 w-3.5" />}
                            inactiveIcon={<X className="h-3.5 w-3.5" />}
                            activeClass="bg-green-100 text-green-700"
                            inactiveClass="bg-muted text-muted-foreground"
                            title={p.enable ? 'Enabled' : 'Disabled'}
                          />
                          <StatusDot
                            active={p.qualifies_for_credit_earning}
                            activeIcon={<CircleDollarSign className="h-3.5 w-3.5" />}
                            inactiveIcon={<CircleDollarSign className="h-3.5 w-3.5" />}
                            activeClass="bg-green-100 text-green-700"
                            inactiveClass="bg-muted text-muted-foreground/60"
                            title={
                              p.qualifies_for_credit_earning ? 'Earns credit' : "Doesn't earn credit"
                            }
                          />
                          <StatusDot
                            active={p.list_in_support_funds}
                            activeIcon={<Gift className="h-3.5 w-3.5" />}
                            inactiveIcon={<Gift className="h-3.5 w-3.5" />}
                            activeClass="bg-brand-periwinkle/15 text-brand-periwinkle"
                            inactiveClass="bg-muted text-muted-foreground/60"
                            title={
                              p.list_in_support_funds
                                ? 'Eligible for support funds'
                                : 'Not in support funds'
                            }
                          />
                        </div>
                      </TableCell>
                      <TableCell
                        className="hidden xl:table-cell"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={p.category_id || ''}
                          onChange={(e) =>
                            handleCategoryChange(p.id, e.target.value ? parseInt(e.target.value) : null)
                          }
                          className="text-xs border border-input rounded-md px-2 py-1 bg-background focus:outline-none focus:ring-2 focus:ring-ring w-full"
                        >
                          <option value="">No category</option>
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell
                        className="text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex gap-1">
                          <Link href={`/admin/products/${p.id}/edit`}>
                            <Button variant="ghost" size="icon" aria-label="Edit">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(p)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function StatusDot({
  active,
  activeIcon,
  inactiveIcon,
  activeClass,
  inactiveClass,
  title,
}: {
  active: boolean;
  activeIcon: React.ReactNode;
  inactiveIcon: React.ReactNode;
  activeClass: string;
  inactiveClass: string;
  title: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${
        active ? activeClass : inactiveClass
      }`}
    >
      {active ? activeIcon : inactiveIcon}
    </span>
  );
}
