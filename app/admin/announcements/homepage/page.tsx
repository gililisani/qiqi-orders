'use client';

/**
 * Homepage news-box settings — which of the five modes the partner
 * dashboard's right box shows. Scroller content is managed on the
 * announcements list; this page picks the mode + mode-specific fields.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import ImageUpload from '../../../components/ImageUpload';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/qq/select';
import { useToast } from '../../../components/ui/ToastProvider';

const MODES = [
  { value: 'nothing', label: 'Nothing — hide the box (activity feed takes the full width)' },
  { value: 'new_release', label: 'New product release' },
  { value: 'news_scroller', label: 'News scroller (shows the live announcements)' },
  { value: 'banner', label: 'Banner — a single image or video' },
  { value: 'latest_dam', label: 'Latest media files (newest DAM uploads)' },
] as const;

export default function HomeNewsBoxSettingsPage() {
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = useState('nothing');
  const [releaseTitle, setReleaseTitle] = useState('');
  const [releaseImageUrl, setReleaseImageUrl] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [releaseLinkUrl, setReleaseLinkUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [bannerIsVideo, setBannerIsVideo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('client_home_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (err) setError(err.message);
      else if (data) {
        setMode(data.news_mode ?? 'nothing');
        setReleaseTitle(data.release_title ?? '');
        setReleaseImageUrl(data.release_image_url ?? '');
        setReleaseDate(data.release_date ?? '');
        setReleaseLinkUrl(data.release_link_url ?? '');
        setBannerUrl(data.banner_url ?? '');
        setBannerIsVideo(!!data.banner_is_video);
      }
      setLoading(false);
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'new_release' && (!releaseTitle.trim() || !releaseImageUrl.trim())) {
      setError('A release needs at least a title and an image.');
      return;
    }
    if (mode === 'banner' && !bannerUrl.trim()) {
      setError('The banner mode needs an image or video URL.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error: err } = await supabase
        .from('client_home_settings')
        .update({
          news_mode: mode,
          release_title: releaseTitle.trim() || null,
          release_image_url: releaseImageUrl.trim() || null,
          release_date: releaseDate || null,
          release_link_url: releaseLinkUrl.trim() || null,
          banner_url: bannerUrl.trim() || null,
          banner_is_video: bannerIsVideo,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('id', 1);
      if (err) throw err;
      toast.success('Homepage box updated.');
      router.push('/admin/announcements');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="Homepage news box"
      description="What partners see in the right box of their dashboard."
      backHref="/admin/announcements"
      backLabel="Back to announcements"
      saving={saving || loading}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/announcements')}
      submitLabel="Save"
    >
      <FormField label="Display mode" required>
        <Select value={mode} onValueChange={setMode}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {mode === 'new_release' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Release title" required>
              <Input
                value={releaseTitle}
                onChange={(e) => setReleaseTitle(e.target.value)}
                placeholder="e.g. Meet the new Volume Code Mist"
              />
            </FormField>
            <FormField label="Release date" helper="Shown as 'Releasing …' until the day, 'Released' after.">
              <Input type="date" value={releaseDate} onChange={(e) => setReleaseDate(e.target.value)} />
            </FormField>
          </div>
          <FormField label="Image" required helper="Uploaded to public storage — also accepts a pasted URL below.">
            <ImageUpload onImageUploaded={setReleaseImageUrl} currentImageUrl={releaseImageUrl || undefined} />
          </FormField>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="Image URL">
              <Input value={releaseImageUrl} onChange={(e) => setReleaseImageUrl(e.target.value)} placeholder="https://…" />
            </FormField>
            <FormField label="Link" helper="Optional — a product page or PDF partners can open.">
              <Input value={releaseLinkUrl} onChange={(e) => setReleaseLinkUrl(e.target.value)} placeholder="https://…" />
            </FormField>
          </div>
        </>
      )}

      {mode === 'news_scroller' && (
        <p className="text-sm text-muted-foreground">
          The scroller shows every <span className="font-medium text-foreground">live</span>{' '}
          announcement (enabled + inside its date window), newest first, and scrolls
          automatically when there are more than fit. Manage the items on the
          announcements list.
        </p>
      )}

      {mode === 'banner' && (
        <>
          <FormField label="Banner image" helper="For an image banner — or paste any image/video URL below.">
            <ImageUpload onImageUploaded={setBannerUrl} currentImageUrl={!bannerIsVideo ? bannerUrl || undefined : undefined} />
          </FormField>
          <FormField label="Image or video URL" required>
            <Input value={bannerUrl} onChange={(e) => setBannerUrl(e.target.value)} placeholder="https://…" />
          </FormField>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={bannerIsVideo}
              onChange={(e) => setBannerIsVideo(e.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            <span className="text-sm">This URL is a video (plays muted, on loop)</span>
          </label>
        </>
      )}

      {mode === 'latest_dam' && (
        <p className="text-sm text-muted-foreground">
          Shows the most recently uploaded media assets — six where the layout fits
          them, four otherwise. No configuration needed.
        </p>
      )}
    </AdminFormShell>
  );
}
