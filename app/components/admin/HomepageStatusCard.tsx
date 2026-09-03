'use client';

/**
 * "What's on the client homepage RIGHT NOW" — the at-a-glance status card on
 * the announcements list (owner QA 2026-09-02: the live state was invisible
 * without clicking into the settings page). Shows the hero-box mode plus how
 * many live announcements are on the dashboard strip.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Monitor, Pencil } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatters';
import { Card, CardContent } from '../qq/card';
import { Button } from '../qq/button';
import { Badge } from '../qq/badge';

interface HomeSettingsRow {
  news_mode: string;
  release_title: string | null;
  release_image_url: string | null;
  release_is_video: boolean;
  release_date: string | null;
  banner_url: string | null;
  banner_is_video: boolean;
}

const MODE_LABEL: Record<string, string> = {
  new_release: 'New Product Release',
  banner: 'Banner',
  latest_dam: 'Latest media',
  nothing: 'Nothing — box hidden',
  // retired 2026-09-02; legacy value renders as hidden
  news_scroller: 'Nothing — box hidden',
};

export function HomepageStatusCard() {
  const [settings, setSettings] = useState<HomeSettingsRow | null>(null);
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [settingsRes, countRes] = await Promise.all([
        supabase.from('client_home_settings').select('*').eq('id', 1).maybeSingle(),
        supabase
          .from('announcements')
          .select('id', { count: 'exact', head: true })
          .eq('enabled', true)
          .lte('starts_at', today)
          .gte('ends_at', today),
      ]);
      setSettings((settingsRes.data as HomeSettingsRow) ?? null);
      setLiveCount(countRes.count ?? 0);
      setLoaded(true);
    })();
  }, []);

  if (!loaded || !settings) return null;

  const mode = settings.news_mode || 'nothing';
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = settings.release_date && settings.release_date > today;

  const mediaUrl =
    mode === 'new_release' ? settings.release_image_url : mode === 'banner' ? settings.banner_url : null;
  const mediaIsVideo = mode === 'new_release' ? settings.release_is_video : settings.banner_is_video;

  const detail =
    mode === 'new_release'
      ? [
          settings.release_title || 'Untitled release',
          settings.release_date
            ? `${upcoming ? 'releasing' : 'released'} ${formatDate(settings.release_date)}`
            : null,
        ]
          .filter(Boolean)
          .join(' — ')
      : mode === 'latest_dam'
        ? "each partner's six newest media assets"
        : mode === 'banner'
          ? 'a full-box image/video, no text'
          : 'the activity feed takes the full width';

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-4">
          {mediaUrl ? (
            mediaIsVideo ? (
              <video
                src={mediaUrl}
                muted
                playsInline
                preload="metadata"
                className="h-16 w-24 rounded-md object-cover bg-[#F3F4F1] border border-border shrink-0"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mediaUrl}
                alt=""
                className="h-16 w-24 rounded-md object-cover bg-[#F3F4F1] border border-border shrink-0"
              />
            )
          ) : (
            <div className="h-16 w-24 rounded-md border border-dashed border-border grid place-items-center shrink-0">
              <Monitor className="h-5 w-5 text-muted-foreground" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Client homepage — showing now
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground flex items-center gap-2">
              {MODE_LABEL[mode] ?? mode}
              {mode === 'new_release' && (
                <Badge variant={upcoming ? 'accent' : 'success'}>
                  {upcoming ? 'Coming soon' : 'Released'}
                </Badge>
              )}
            </p>
            <p className="text-sm text-muted-foreground truncate">{detail}</p>
          </div>

          <Link href="/admin/announcements/homepage" className="shrink-0">
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4" /> Change
            </Button>
          </Link>
        </div>

        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          {(liveCount ?? 0) > 0 ? (
            <>
              <strong className="text-foreground">{liveCount}</strong> live announcement
              {liveCount === 1 ? '' : 's'} showing in the dashboard&apos;s news ticker — always
              visible, independent of the box mode.
            </>
          ) : (
            <>No live announcements right now — the news ticker is hidden.</>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
