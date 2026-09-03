'use client';

/**
 * Dashboard announcements strip — coming-soon teasers, launches, restocks,
 * offers, with type badges and the announcement/product image. Revived
 * 2026-09-02 (owner decision): announcements get their own always-on surface
 * instead of competing with the homepage hero box for one slot.
 * Only live rows render (enabled + inside the date window); nothing when
 * there's no news.
 */

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { Card, CardContent } from '../qq/card';
import { Badge } from '../qq/badge';

interface Announcement {
  id: string;
  title: string;
  body: string | null;
  type: string;
  image_url: string | null;
  product: { item_name: string | null; picture_url: string | null } | null;
}

const TYPE_BADGE: Record<string, { label: string; variant: 'accent' | 'success' | 'warning' | 'destructive' | 'outline' }> = {
  coming_soon: { label: 'Coming soon', variant: 'accent' },
  launch: { label: 'New', variant: 'success' },
  back_in_stock: { label: 'Back in stock', variant: 'warning' },
  offer: { label: 'Offer', variant: 'destructive' },
  news: { label: 'News', variant: 'outline' },
};

export function AnnouncementsRail() {
  const [items, setItems] = useState<Announcement[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase
        .from('announcements')
        .select('id, title, body, type, image_url, product:Products(item_name, picture_url)')
        .eq('enabled', true)
        .lte('starts_at', today)
        .gte('ends_at', today)
        .order('starts_at', { ascending: false });
      if (!cancelled && data) setItems(data as unknown as Announcement[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className={`grid grid-cols-1 ${items.length > 1 ? 'md:grid-cols-2' : ''} gap-4`}>
      {items.map((a) => {
        const badge = TYPE_BADGE[a.type] ?? TYPE_BADGE.news;
        const image = a.image_url || a.product?.picture_url || null;
        const teaser = a.type === 'coming_soon';
        return (
          <Card
            key={a.id}
            className={teaser ? 'border-brand-periwinkle/40 bg-brand-periwinkle/5 overflow-hidden' : 'overflow-hidden'}
          >
            <CardContent className="p-0">
              <div className="flex items-stretch">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={image}
                    alt={a.title}
                    className="w-28 sm:w-36 object-cover shrink-0"
                  />
                ) : teaser ? (
                  <div className="w-28 sm:w-36 shrink-0 flex items-center justify-center bg-brand-periwinkle/10">
                    <Sparkles className="h-8 w-8 text-brand-periwinkle" />
                  </div>
                ) : null}
                <div className="p-4 min-w-0">
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                  <p className="mt-2 text-base font-semibold leading-snug">{a.title}</p>
                  {a.body && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{a.body}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
