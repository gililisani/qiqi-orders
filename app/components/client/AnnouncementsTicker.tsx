'use client';

/**
 * News & announcements — the top half of the dashboard's left column
 * (owner redesign 2026-09-02, replacing the card strip). Live announcements
 * with a type badge per item; auto-scrolls upward when there are more than
 * fit, pausing on hover. Renders nothing when no announcements are live
 * (the activity feed then takes the whole column).
 */

import { useEffect, useRef, useState } from 'react';

import { supabase } from '../../../lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Badge } from '../qq/badge';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  type: string;
}

const TYPE_BADGE: Record<string, { label: string; variant: 'accent' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  coming_soon: { label: 'Coming soon', variant: 'accent' },
  launch: { label: 'New', variant: 'success' },
  back_in_stock: { label: 'Back in stock', variant: 'warning' },
  offer: { label: 'Offer', variant: 'destructive' },
  news: { label: 'News', variant: 'outline' },
};

export function AnnouncementsTicker() {
  const [items, setItems] = useState<Announcement[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('announcements')
        .select('id, title, body, type')
        .eq('enabled', true)
        .lte('starts_at', today)
        .gte('ends_at', today)
        .order('starts_at', { ascending: false });
      setItems((data as Announcement[]) || []);
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
      {items.map((a) => {
        const badge = TYPE_BADGE[a.type] ?? TYPE_BADGE.news;
        return (
          <div key={a.id}>
            <div className="flex items-center gap-2">
              <Badge variant={badge.variant}>{badge.label}</Badge>
              <p className="text-sm font-medium leading-snug truncate">{a.title}</p>
            </div>
            {a.body && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.body}</p>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="flex-1 min-h-0">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">News &amp; announcements</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 min-h-0">
          <div ref={containerRef} className="relative h-full min-h-32 overflow-hidden news-ticker">
            <div
              ref={contentRef}
              className={overflowing ? 'animate-news-ticker' : ''}
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
          {/* Upward marquee: only when content overflows; pauses on hover. */}
          <style jsx global>{`
            @keyframes news-ticker-up {
              from { transform: translateY(0); }
              to { transform: translateY(-50%); }
            }
            .animate-news-ticker {
              animation: news-ticker-up linear infinite;
            }
            .news-ticker:hover .animate-news-ticker {
              animation-play-state: paused;
            }
          `}</style>
        </CardContent>
      </Card>
    </div>
  );
}
