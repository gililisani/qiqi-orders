'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import {
  CategoryFormFields,
  EMPTY_CATEGORY_FORM,
  type CategoryFormData,
} from '../../../components/admin/CategoryFormFields';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewCategoryPage() {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CategoryFormData>(EMPTY_CATEGORY_FORM);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setError('Category name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from('categories').insert([
        {
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          sort_order: formData.sort_order ? parseInt(formData.sort_order) : 0,
          visible_to_americas: formData.visible_to_americas,
          visible_to_international: formData.visible_to_international,
          image_url: formData.image_url || null,
        },
      ]);
      if (insertError) throw insertError;
      toast.success('Category created.');
      router.push('/admin/categories');
    } catch (err: any) {
      setError(err.message || 'Failed to create category.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New category"
      description="Create a product category for organizing the catalog."
      backHref="/admin/categories"
      backLabel="Back to categories"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/categories')}
      submitLabel="Create category"
    >
      <CategoryFormFields
        formData={formData}
        onChange={(patch) => setFormData((p) => ({ ...p, ...patch }))}
      />
    </AdminFormShell>
  );
}
