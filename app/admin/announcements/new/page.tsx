'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import {
  AnnouncementForm,
  EMPTY_ANNOUNCEMENT,
  type AnnouncementFormData,
} from '../../../components/admin/AnnouncementForm';
import { useToast } from '../../../components/ui/ToastProvider';

export default function NewAnnouncementPage() {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState<AnnouncementFormData>(EMPTY_ANNOUNCEMENT);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.ends_at) {
      setError('Title and an end date are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase.from('announcements').insert({
        title: form.title.trim(),
        body: form.body.trim() || null,
        type: form.type,
        product_id: form.product_id ? Number(form.product_id) : null,
        image_url: form.image_url.trim() || null,
        starts_at: form.starts_at,
        ends_at: form.ends_at,
        enabled: form.enabled,
        created_by: user?.id ?? null,
      });
      if (err) throw err;
      toast.success('Announcement created.');
      router.push('/admin/announcements');
    } catch (err: any) {
      setError(err.message || 'Failed to create announcement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New announcement"
      backHref="/admin/announcements"
      backLabel="Back to announcements"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/announcements')}
      submitLabel="Create announcement"
    >
      <AnnouncementForm value={form} onChange={(p) => setForm((f) => ({ ...f, ...p }))} />
    </AdminFormShell>
  );
}
