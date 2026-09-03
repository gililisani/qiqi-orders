'use client';

/**
 * Client-homepage command center (owner QA 2026-09-02): the left pane is a
 * LIVE preview — it renders the actual HomeNewsBox component clients see,
 * fed by the UNSAVED form state, so every keystroke updates it and there is
 * never a need to log in as a client to check. The right pane holds the
 * mode + mode-specific fields.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { Button } from '../../../components/qq/button';
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
import { HomeNewsBox, type HomeSettings } from '../../../components/client/HomeNewsBox';

const MODES = [
  { value: 'nothing', label: 'Nothing — hide the box (activity feed takes the full width)' },
  { value: 'new_release', label: 'New product release' },
  { value: 'banner', label: 'Banner — a single image or video' },
  { value: 'latest_dam', label: 'Latest media files (newest DAM uploads)' },
] as const;

export default function HomeNewsBoxSettingsPage() {
  const toast = useToast();

  const [mode, setMode] = useState('nothing');
  const [releaseTitle, setReleaseTitle] = useState('');
  const [releaseImageUrl, setReleaseImageUrl] = useState('');
  const [releaseIsVideo, setReleaseIsVideo] = useState(false);
  const [releaseTextColor, setReleaseTextColor] = useState('white');
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
        // 'news_scroller' was retired 2026-09-02 (announcements now always
        // show on the dashboard strip) — treat a legacy value as 'nothing'.
        setMode(data.news_mode === 'news_scroller' ? 'nothing' : (data.news_mode ?? 'nothing'));
        setReleaseTitle(data.release_title ?? '');
        setReleaseImageUrl(data.release_image_url ?? '');
        setReleaseIsVideo(!!data.release_is_video);
        setReleaseTextColor(data.release_text_color ?? 'white');
        setReleaseDate(data.release_date ?? '');
        setReleaseLinkUrl(data.release_link_url ?? '');
        setBannerUrl(data.banner_url ?? '');
        setBannerIsVideo(!!data.banner_is_video);
      }
      setLoading(false);
    })();
  }, []);

  // The unsaved draft, in exactly the shape the client dashboard consumes.
  const draft: HomeSettings = {
    news_mode: mode,
    release_title: releaseTitle.trim() || null,
    release_image_url: releaseImageUrl.trim() || null,
    release_is_video: releaseIsVideo,
    release_text_color: (releaseTextColor as 'white' | 'black') || 'white',
    release_date: releaseDate || null,
    release_link_url: releaseLinkUrl.trim() || null,
    banner_url: bannerUrl.trim() || null,
    banner_is_video: bannerIsVideo,
  };

  const handleSave = async () => {
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
          release_is_video: releaseIsVideo,
          release_text_color: releaseTextColor,
          release_date: releaseDate || null,
          release_link_url: releaseLinkUrl.trim() || null,
          banner_url: bannerUrl.trim() || null,
          banner_is_video: bannerIsVideo,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq('id', 1);
      if (err) throw err;
      toast.success('Published — clients see this now.');
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/announcements"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to announcements
        </Link>
      </div>

      <PageHeader
        title="Client homepage"
        description="The right box of every partner's dashboard. The preview is the real thing — what you see is what they get."
        actions={
          <Button size="sm" onClick={handleSave} loading={saving} disabled={loading}>
            {saving ? 'Publishing…' : 'Save & publish'}
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* ---- Live preview ---- */}
        <div className="lg:sticky lg:top-6 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Live preview — updates as you type
          </p>
          {loading ? (
            <div className="border border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
              Loading…
            </div>
          ) : mode === 'nothing' ? (
            <div className="border border-dashed border-border rounded-lg p-10 text-center text-sm text-muted-foreground">
              The box is hidden — the activity feed takes the full width of the dashboard.
            </div>
          ) : (
            <HomeNewsBox settings={draft} adminPreview />
          )}
          <p className="text-xs text-muted-foreground">
            Nothing reaches clients until you press Save &amp; publish.
          </p>
        </div>

        {/* ---- Controls ---- */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
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
                <FormField label="Media" required helper="Image upload below, or paste an image/MP4 URL. The whole clip always shows — off-format media letterboxes on the Qiqi backdrop color.">
                  <ImageUpload onImageUploaded={setReleaseImageUrl} currentImageUrl={!releaseIsVideo ? releaseImageUrl || undefined : undefined} />
                </FormField>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Image or video URL">
                    <Input value={releaseImageUrl} onChange={(e) => setReleaseImageUrl(e.target.value)} placeholder="https://…" />
                  </FormField>
                  <FormField label="Link" helper="Optional — a product page or PDF partners can open.">
                    <Input value={releaseLinkUrl} onChange={(e) => setReleaseLinkUrl(e.target.value)} placeholder="https://…" />
                  </FormField>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
                  <FormField
                    label="Overlay text color"
                    helper="White for dark media, black for bright media — check the preview."
                  >
                    <Select value={releaseTextColor} onValueChange={setReleaseTextColor}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="white">White text (dark media)</SelectItem>
                        <SelectItem value="black">Black text (bright media)</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                  <label className="flex items-center gap-2 cursor-pointer select-none pb-2">
                    <input
                      type="checkbox"
                      checked={releaseIsVideo}
                      onChange={(e) => setReleaseIsVideo(e.target.checked)}
                      className="h-4 w-4 accent-foreground"
                    />
                    <span className="text-sm">The media URL is a video (plays muted, on loop)</span>
                  </label>
                </div>
              </>
            )}

            {mode === 'banner' && (
              <>
                <FormField label="Banner image" helper="Recommended 16:9 — 1920×1080 (or 1280×720). For video, paste the URL below; MP4 works best.">
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
                Shows each partner the most recently uploaded media assets they have
                access to — six where the layout fits them, four otherwise. No
                configuration needed.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
