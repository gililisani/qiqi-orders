'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import {
  AnnouncementForm,
  EMPTY_ANNOUNCEMENT,
  type AnnouncementFormData,
} from '../../../../components/admin/AnnouncementForm';
import { useToast } from '../../../../components/ui/ToastProvider';

export default function EditAnnouncementPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const toast = useToast();

  const [form, setForm] = useState<AnnouncementFormData>(EMPTY_ANNOUNCEMENT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('announcements')
          .select('*')
          .eq('id', id)
          .single();
        if (err) throw err;
        setForm({
          title: data.title ?? '',
          body: data.body ?? '',
          type: data.type ?? 'news',
          product_id: data.product_id ? String(data.product_id) : '',
          image_url: data.image_url ?? '',
          starts_at: data.starts_at ?? '',
          ends_at: data.ends_at ?? '',
          enabled: !!data.enabled,
        });
      } catch (err: any) {
        setError(err.message || 'Failed to load announcement.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.ends_at) {
      setError('Title and an end date are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: err } = await supabase
        .from('announcements')
        .update({
          title: form.title.trim(),
          body: form.body.trim() || null,
          type: form.type,
          product_id: form.product_id ? Number(form.product_id) : null,
          image_url: form.image_url.trim() || null,
          starts_at: form.starts_at,
          ends_at: form.ends_at,
          enabled: form.enabled,
        })
        .eq('id', id);
      if (err) throw err;
      toast.success('Announcement updated.');
      router.push('/admin/announcements');
    } catch (err: any) {
      setError(err.message || 'Failed to update announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Edit announcement"
      backHref="/admin/announcements"
      backLabel="Back to announcements"
      saving={saving || loading}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/announcements')}
      submitLabel="Save changes"
    >
      <AnnouncementForm
        value={form}
        onChange={(p) => setForm((f) => ({ ...f, ...p }))}
        disabled={loading}
      />
    </AdminFormShell>
  );
}
