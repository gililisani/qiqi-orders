'use client';

/**
 * The dashboard's right box — admin picks one of four modes
 * (client_home_settings): new-release card, banner image/video, latest DAM
 * uploads, or nothing (parent hides the box and stretches the activity
 * feed). The old "news scroller" mode was retired 2026-09-02 — live
 * announcements now always render on the dashboard strip (AnnouncementsRail)
 * and no longer compete with this box; a legacy 'news_scroller' value is
 * treated as 'nothing'.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { resolveSignedAssetUrl } from '../dam/utils';

export interface HomeSettings {
  news_mode: string;
  release_title: string | null;
  release_image_url: string | null;
  release_is_video: boolean;
  release_text_color: 'white' | 'black' | null;
  release_date: string | null;
  release_link_url: string | null;
  banner_url: string | null;
  banner_is_video: boolean;
}

/** adminPreview: rendered inside the admin command center — same pixels,
 *  but client-entitlement-scoped data (latest DAM) shows a placeholder. */
export function HomeNewsBox({
  settings,
  adminPreview = false,
}: {
  settings: HomeSettings;
  adminPreview?: boolean;
}) {
  switch (settings.news_mode) {
    case 'new_release':
      return <NewRelease s={settings} />;
    case 'banner':
      return <Banner s={settings} />;
    case 'latest_dam':
      return <LatestMedia adminPreview={adminPreview} />;
    default:
      return null;
  }
}

// --- Mode 1: new product release ------------------------------------------
function NewRelease({ s }: { s: HomeSettings }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = s.release_date && s.release_date > today;
  const dark = s.release_text_color === 'black';
  const text = dark ? 'text-black' : 'text-white';

  return (
    <Card className="overflow-hidden h-full">
      {/* Full media with everything overlaid, no scrim (owner 2026-09-02:
          show the video untouched). object-CONTAIN so the whole video/image
          is always visible; the letterbox ground is #F3F4F1 — the backdrop
          color of Qiqi's own product videos (sampled from qiqiglobal.com),
          so the bars blend into the footage. */}
      <div className="relative w-full h-full min-h-[28rem] bg-[#F3F4F1]">
        {s.release_image_url &&
          (s.release_is_video ? (
            <video
              src={s.release_image_url}
              autoPlay
              muted
              loop
              playsInline
              className="absolute inset-0 w-full h-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={s.release_image_url}
              alt={s.release_title || 'New release'}
              className="absolute inset-0 w-full h-full object-contain"
            />
          ))}
        <div className={`absolute inset-0 p-4 flex flex-col justify-between ${text}`}>
          <p className="text-sm font-semibold tracking-tight drop-shadow-sm">
            New Product Release
          </p>
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <span
                className={`inline-flex items-center rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                  dark ? 'bg-black/10 border border-black/30' : 'bg-white/15 border border-white/40'
                }`}
              >
                {upcoming ? 'Coming soon' : 'New release'}
              </span>
              <p className="mt-1.5 text-xl font-bold leading-tight drop-shadow-sm">
                {s.release_title}
              </p>
              {s.release_date && (
                <p className="mt-0.5 text-xs opacity-90">
                  {upcoming ? 'Releasing' : 'Released'} {formatDate(s.release_date)}
                </p>
              )}
            </div>
            {s.release_link_url && (
              <a
                href={s.release_link_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${
                  dark
                    ? 'border-black/40 hover:bg-black/10'
                    : 'border-white/60 hover:bg-white/15'
                }`}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Learn more
              </a>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

// --- Mode 3: banner --------------------------------------------------------
function Banner({ s }: { s: HomeSettings }) {
  if (!s.banner_url) return null;
  // Fixed 16:9 frame (recommend 1920×1080). Images fill it (cover); videos
  // are never cut — a non-16:9 video letterboxes on black instead.
  return (
    <Card className="overflow-hidden h-full">
      <div className="w-full h-full min-h-56 bg-black">
        {s.banner_is_video ? (
          <video
            src={s.banner_url}
            autoPlay
            muted
            loop
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.banner_url} alt="" className="w-full h-full object-cover" />
        )}
      </div>
    </Card>
  );
}

// --- Mode 5: latest DAM uploads -------------------------------------------
interface DamAsset {
  id: string;
  title: string;
  vimeo_video_id?: string | null;
  created_at?: string;
  current_version?: { previewPath?: string | null } | null;
}

function LatestMedia({ adminPreview = false }: { adminPreview?: boolean }) {
  const [tiles, setTiles] = useState<Array<{ id: string; title: string; url: string | null }>>([]);

  useEffect(() => {
    if (adminPreview) return; // entitlement-scoped per client — no admin fetch
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) return;
        const res = await fetch('/api/dam/assets/client?limit=6&page=1', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { assets?: DamAsset[] };
        const assets = (payload.assets ?? [])
          .sort((a, b) => ((a.created_at ?? '') < (b.created_at ?? '') ? 1 : -1))
          .slice(0, 6);
        const resolved = await Promise.all(
          assets.map(async (a) => {
            if (a.vimeo_video_id) {
              return { id: a.id, title: a.title, url: `https://vumbnail.com/${a.vimeo_video_id}.jpg` };
            }
            const path = a.current_version?.previewPath;
            const url = path ? await resolveSignedAssetUrl(path, token) : null;
            return { id: a.id, title: a.title, url };
          }),
        );
        if (!cancelled) setTiles(resolved.filter((t) => t.url));
      } catch {
        /* stay empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (adminPreview) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Latest media</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`aspect-square rounded-md border border-dashed border-border bg-secondary/40 ${i >= 4 ? 'hidden xl:block' : ''}`}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Each partner sees the six newest media assets they have access to —
            the exact tiles vary per partner, so the preview shows placeholders.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (tiles.length === 0) return null;

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Latest media</CardTitle>
      </CardHeader>
      <CardContent>
        {/* 2×2 (4 tiles) normally; 3×2 (6) where the box is wide enough. */}
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
          {tiles.map((t, i) => (
            <Link
              key={t.id}
              href="/client/assets"
              className={`block rounded-md overflow-hidden border border-border hover:border-foreground/30 transition-colors ${
                i >= 4 ? 'hidden xl:block' : ''
              }`}
              title={t.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.url!} alt={t.title} className="aspect-square w-full object-cover" />
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
