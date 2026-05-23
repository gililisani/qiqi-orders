'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import {
  CategoryFormFields,
  EMPTY_CATEGORY_FORM,
  type CategoryFormData,
} from '../../../../components/admin/CategoryFormFields';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditCategoryPage() {
  const router = useRouter();
  const params = useParams();
  const categoryId = params.id as string;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(EMPTY_CATEGORY_FORM);

  useEffect(() => {
    if (!categoryId) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('id', categoryId)
          .single();
        if (error) throw error;
        setFormData({
          name: data.name || '',
          description: data.description || '',
          sort_order: data.sort_order?.toString() || '0',
          visible_to_americas: data.visible_to_americas ?? true,
          visible_to_international: data.visible_to_international ?? true,
          image_url: data.image_url || '',
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load category.');
      } finally {
        setLoading(false);
      }
    })();
  }, [categoryId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Category name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('categories')
        .update({
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          sort_order: formData.sort_order ? parseInt(formData.sort_order) : 0,
          visible_to_americas: formData.visible_to_americas,
          visible_to_international: formData.visible_to_international,
          image_url: formData.image_url || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', categoryId);
      if (updateError) throw updateError;
      toast.success('Category updated.');
      router.push('/admin/categories');
    } catch (err: any) {
      setError(err.message || 'Failed to update category.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading category…</p>
      </div>
    );
  }

  return (
    <AdminFormShell
      title="Edit category"
      description={formData.name || undefined}
      backHref="/admin/categories"
      backLabel="Back to categories"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/categories')}
      submitLabel="Save changes"
    >
      <CategoryFormFields
        formData={formData}
        onChange={(patch) => setFormData((p) => ({ ...p, ...patch }))}
      />
    </AdminFormShell>
  );
}
