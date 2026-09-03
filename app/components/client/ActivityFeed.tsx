'use client';

/**
 * Dashboard activity feed (replaces the static Quick Actions box): the
 * latest notes from Qiqi and client-visible order updates, newest first.
 * Both queries are RLS-scoped to the caller's company.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StickyNote, Package } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatDateTime } from '../../../lib/formatters';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';

interface FeedItem {
  key: string;
  kind: 'note' | 'order';
  title: string;
  detail: string | null;
  createdAt: string;
  href: string;
}

export function ActivityFeed({ limit = 6 }: { limit?: number } = {}) {
  const router = useRouter();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [notesRes, historyRes] = await Promise.all([
          supabase
            .from('company_notes')
            .select('id, title, note_type, created_at')
            .order('created_at', { ascending: false })
            .limit(4),
          supabase
            .from('order_history')
            .select('id, order_id, action_type, notes, created_at, order:orders(po_number)')
            .order('created_at', { ascending: false })
            .limit(8),
        ]);

        const feed: FeedItem[] = [];
        for (const n of notesRes.data ?? []) {
          feed.push({
            key: `note-${n.id}`,
            kind: 'note',
            title: n.title,
            detail: 'New note from Qiqi',
            createdAt: n.created_at,
            href: '/client/notes',
          });
        }
        for (const h of historyRes.data ?? []) {
          const po = (Array.isArray(h.order) ? h.order[0] : h.order)?.po_number;
          feed.push({
            key: `oh-${h.id}`,
            kind: 'order',
            title: h.notes || h.action_type?.replace(/_/g, ' ') || 'Order update',
            detail: po ? `Order ${po}` : null,
            createdAt: h.created_at,
            href: `/client/orders/${h.order_id}`,
          });
        }
        feed.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        if (!cancelled) setItems(feed.slice(0, limit));
      } catch {
        /* leave empty */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [limit]);

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Recent activity</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Updates about your orders and notes from Qiqi will appear here.
          </p>
        ) : (
          <ul className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {items.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  onClick={() => router.push(item.href)}
                  className="w-full flex items-start gap-3 text-left rounded-md px-2 py-1.5 -mx-2 hover:bg-secondary/60 transition-colors"
                >
                  {item.kind === 'note' ? (
                    <StickyNote className="h-4 w-4 mt-0.5 text-brand-periwinkle shrink-0" />
                  ) : (
                    <Package className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm leading-snug truncate">{item.title}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {item.detail ? `${item.detail} · ` : ''}
                      {formatDateTime(item.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
