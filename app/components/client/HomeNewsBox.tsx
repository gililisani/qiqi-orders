'use client';

/**
 * The dashboard's right box — admin picks one of five modes
 * (client_home_settings): new-release card, auto-scrolling news, banner
 * image/video, latest DAM uploads, or nothing (parent hides the box and
 * stretches the activity feed).
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Badge } from '../qq/badge';
import { Button } from '../qq/button';
import { resolveSignedAssetUrl } from '../dam/utils';

export interface HomeSettings {
  news_mode: string;
  release_title: string | null;
  release_image_url: string | null;
  release_date: string | null;
  release_link_url: string | null;
  banner_url: string | null;
  banner_is_video: boolean;
}

export function HomeNewsBox({ settings }: { settings: HomeSettings }) {
  switch (settings.news_mode) {
    case 'new_release':
      return <NewRelease s={settings} />;
    case 'news_scroller':
      return <NewsScroller />;
    case 'banner':
      return <Banner s={settings} />;
    case 'latest_dam':
      return <LatestMedia />;
    default:
      return null;
  }
}

// --- Mode 1: new product release ------------------------------------------
function NewRelease({ s }: { s: HomeSettings }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = s.release_date && s.release_date > today;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">New Product Release</CardTitle>
      </CardHeader>
      {s.release_image_url && (
        // Fixed-height strip so the card matches the activity feed's
        // footprint; wide images center-crop into it.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={s.release_image_url}
          alt={s.release_title || 'New release'}
          className="w-full h-40 object-cover"
        />
      )}
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Badge variant="accent">{upcoming ? 'Coming soon' : 'New release'}</Badge>
            <p className="mt-1.5 text-base font-semibold leading-snug">{s.release_title}</p>
            {s.release_date && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {upcoming ? 'Releasing' : 'Released'} {formatDate(s.release_date)}
              </p>
            )}
          </div>
          {s.release_link_url && (
            <a href={s.release_link_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" /> Learn more
              </Button>
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// --- Mode 2: news scroller -------------------------------------------------
interface NewsItem {
  id: string;
  title: string;
  body: string | null;
}

function NewsScroller() {
  const [items, setItems] = useState<NewsItem[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    (async () => {
      // RLS returns only enabled announcements inside their date window.
      const { data } = await supabase
        .from('announcements')
        .select('id, title, body')
        .order('starts_at', { ascending: false });
      setItems((data as NewsItem[]) || []);
    })();
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;
    setOverflowing(content.scrollHeight > container.clientHeight + 8);
  }, [items]);

  if (items.length === 0) return null;

  const list = (
    <div className="space-y-3 pb-3">
      {items.map((n) => (
        <div key={n.id}>
          <p className="text-sm font-medium leading-snug">{n.title}</p>
          {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
        </div>
      ))}
    </div>
  );

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">News</CardTitle>
      </CardHeader>
      <CardContent>
        <div ref={containerRef} className="relative h-56 overflow-hidden news-scroller">
          <div
            ref={contentRef}
            className={overflowing ? 'animate-news-scroll' : ''}
            style={
              overflowing
                ? { animationDuration: `${Math.max(12, items.length * 5)}s` }
                : undefined
            }
          >
            {list}
            {/* duplicate for a seamless loop */}
            {overflowing && list}
          </div>
        </div>
        {/* Upward marquee: only runs when content overflows; pauses on hover. */}
        <style jsx global>{`
          @keyframes news-scroll-up {
            from { transform: translateY(0); }
            to { transform: translateY(-50%); }
          }
          .animate-news-scroll {
            animation: news-scroll-up linear infinite;
          }
          .news-scroller:hover .animate-news-scroll {
            animation-play-state: paused;
          }
        `}</style>
      </CardContent>
    </Card>
  );
}

// --- Mode 3: banner --------------------------------------------------------
function Banner({ s }: { s: HomeSettings }) {
  if (!s.banner_url) return null;
  // Fixed 16:9 frame (recommend 1920×1080). Images fill it (cover); videos
  // are never cut — a non-16:9 video letterboxes on black instead.
  return (
    <Card className="overflow-hidden">
      <div className="aspect-video w-full bg-black">
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

function LatestMedia() {
  const [tiles, setTiles] = useState<Array<{ id: string; title: string; url: string | null }>>([]);

  useEffect(() => {
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
