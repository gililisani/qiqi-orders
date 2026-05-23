'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, GripVertical } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Badge } from '../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { useToast } from '../../../components/ui/ToastProvider';

interface Category {
  id: number;
  name: string;
  description?: string;
  sort_order: number;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  product_count: number;
}

export default function ReorderCategoriesPage() {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*, product_count:Products(count)')
        .order('sort_order');
      if (error) throw error;
      setCategories(
        (data || []).map((c: any) => ({ ...c, product_count: c.product_count?.[0]?.count || 0 }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load categories.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }
    const next = [...categories];
    const [moved] = next.splice(draggedIndex, 1);
    next.splice(dropIndex, 0, moved);
    setCategories(next.map((c, i) => ({ ...c, sort_order: i + 1 })));
    setDraggedIndex(null);
  };

  const handleSaveOrder = async () => {
    setSaving(true);
    setError(null);
    try {
      const updates = categories.map((c, i) =>
        supabase.from('categories').update({ sort_order: i + 1 }).eq('id', c.id)
      );
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) throw new Error('Failed to update some categories.');
      toast.success('Category order saved.');
      await fetchCategories();
    } catch (err: any) {
      setError(err.message || 'Failed to save order.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/categories"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to categories
        </Link>
      </div>

      <PageHeader
        title="Reorder categories"
        description="Drag and drop categories to change the order they appear in order forms."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={fetchCategories} disabled={saving}>
              Reset
            </Button>
            <Button size="sm" onClick={handleSaveOrder} loading={saving}>
              Save order
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-4">
          {categories.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No categories yet.</p>
              <Link
                href="/admin/categories/new"
                className="text-sm text-foreground hover:underline mt-2 inline-block"
              >
                Create your first category
              </Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {categories.map((c, index) => (
                <li
                  key={c.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className={`flex items-center gap-3 p-3 border rounded-md cursor-move transition-all bg-background ${
                    draggedIndex === index
                      ? 'border-foreground shadow-md opacity-60'
                      : 'border-border hover:border-foreground/30'
                  }`}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-mono">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-muted-foreground truncate">{c.description}</div>
                    )}
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    <Badge variant="muted">{c.product_count} products</Badge>
                    {c.visible_to_americas ? (
                      <Badge variant="success">AMR</Badge>
                    ) : (
                      <Badge variant="muted">AMR</Badge>
                    )}
                    {c.visible_to_international ? (
                      <Badge variant="success">INT</Badge>
                    ) : (
                      <Badge variant="muted">INT</Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How it works</p>
          <p>Drag rows to reorder. The order here determines how categories appear in the client order form. Products without a category always appear at the bottom. Changes only save when you click <span className="font-medium text-foreground">Save order</span>.</p>
        </CardContent>
      </Card>
    </div>
  );
}
