'use client';

import Link from 'next/link';
import { ArrowUpDown, Trash2 } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { AdminListPage } from '../../components/admin/AdminListPage';
import { Badge } from '../../components/qq/badge';
import { Button } from '../../components/qq/button';
import { DropdownMenuItem } from '../../components/qq/dropdown-menu';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';

interface Category {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  image_url: string | null;
  product_count: number;
}

async function fetchCategories(): Promise<{ data: Category[] | null; error: any }> {
  const { data, error } = await supabase
    .from('categories')
    .select(`id, name, description, sort_order, visible_to_americas, visible_to_international, image_url, product_count:Products(count)`)
    .order('sort_order', { ascending: true });
  if (error) return { data: null, error };
  const rows: Category[] = (data || []).map((c: any) => ({
    ...c,
    product_count: c.product_count?.[0]?.count || 0,
  }));
  return { data: rows, error: null };
}

export default function CategoriesPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const handleDelete = async (c: Category) => {
    const ok = await confirm({
      title: 'Delete category?',
      description: `Permanently delete "${c.name}". The category will be removed from ${c.product_count} product${c.product_count === 1 ? '' : 's'} (the products themselves are kept).`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      // Detach from all products first.
      const { error: updateError } = await supabase
        .from('Products')
        .update({ category_id: null })
        .eq('category_id', c.id);
      if (updateError) throw updateError;
      const { error: deleteError } = await supabase.from('categories').delete().eq('id', c.id);
      if (deleteError) throw deleteError;
      toast.success('Category deleted.');
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete category.');
    }
  };

  return (
    <AdminListPage<Category>
      title="Product categories"
      description="Categories used to organize the product catalog."
      newUrl="/admin/categories/new"
      newLabel="Add category"
      editUrl={(id) => `/admin/categories/${id}/edit`}
      fetch={fetchCategories}
      searchPlaceholder="Search by name…"
      filterRow={(c, q) =>
        (c.name ?? '').toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q)
      }
      extraHeaderActions={
        <Link href="/admin/categories/reorder">
          <Button variant="outline" size="sm">
            <ArrowUpDown className="h-4 w-4" /> Reorder
          </Button>
        </Link>
      }
      columns={[
        {
          header: 'Order',
          className: 'hidden sm:table-cell w-16',
          cell: (c) => <span className="font-mono text-sm">{c.sort_order}</span>,
        },
        {
          header: 'Image',
          className: 'hidden md:table-cell w-20',
          cell: (c) =>
            c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.image_url}
                alt={c.name}
                className="h-10 w-10 rounded object-cover border border-border"
              />
            ) : (
              <div className="h-10 w-10 rounded border border-border bg-muted/50 flex items-center justify-center text-[10px] text-muted-foreground">
                —
              </div>
            ),
        },
        {
          header: 'Category',
          cell: (c) => (
            <div>
              <div className="text-sm font-medium text-foreground">{c.name}</div>
              {c.description && (
                <div className="text-xs text-muted-foreground">{c.description}</div>
              )}
            </div>
          ),
        },
        {
          header: 'Products',
          className: 'hidden lg:table-cell',
          cell: (c) => <span className="font-mono text-sm">{c.product_count}</span>,
        },
        {
          header: 'Americas',
          className: 'hidden lg:table-cell',
          cell: (c) =>
            c.visible_to_americas ? (
              <Badge variant="success">Visible</Badge>
            ) : (
              <Badge variant="muted">Hidden</Badge>
            ),
        },
        {
          header: 'International',
          className: 'hidden lg:table-cell',
          cell: (c) =>
            c.visible_to_international ? (
              <Badge variant="success">Visible</Badge>
            ) : (
              <Badge variant="muted">Hidden</Badge>
            ),
        },
      ]}
      extraRowActions={(c) => (
        <DropdownMenuItem
          onClick={() => handleDelete(c)}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="h-4 w-4 mr-2" /> Delete
        </DropdownMenuItem>
      )}
    />
  );
}
