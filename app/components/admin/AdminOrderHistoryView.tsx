'use client';

/**
 * AdminOrderHistoryView — admin-only timeline of order events.
 *
 * Forked from app/components/shared/OrderHistoryView so we can drop the
 * inner Card wrapper (parent already wraps in one), drop the duplicate
 * heading (parent uses SectionHeader), and use qq primitives.
 */

import { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ArrowRight,
  Upload,
  Package,
  Edit3,
  Info,
} from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { Badge } from '../qq/badge';
import { Alert, AlertDescription } from '../qq/alert';
import { StatusBadge } from '../qq/status-badge';
import { formatNumber } from '../../../lib/formatters';

interface OrderHistoryEntry {
  id: string;
  action_type: string;
  status_from?: string;
  status_to?: string;
  document_type?: string;
  document_filename?: string;
  notes?: string;
  changed_by_name: string;
  changed_by_role: string;
  metadata?: any;
  created_at: string;
}

interface Props {
  orderId: string;
}

const ACTION_LABELS: Record<string, string> = {
  order_created: 'Order created',
  status_change: 'Status changed',
  document_uploaded: 'Document uploaded',
  document_deleted: 'Document deleted',
  packing_slip_created: 'Packing slip created',
  order_updated: 'Order updated',
};

const ROLE_VARIANT: Record<string, 'accent' | 'secondary' | 'muted'> = {
  admin: 'accent',
  client: 'secondary',
  system: 'muted',
};

function actionIcon(type: string) {
  const cls = 'h-4 w-4';
  switch (type) {
    case 'order_created':
      return <CheckCircle2 className={`${cls} text-emerald-600`} />;
    case 'status_change':
      return <ArrowRight className={`${cls} text-brand-periwinkle`} />;
    case 'document_uploaded':
      return <Upload className={`${cls} text-foreground`} />;
    case 'document_deleted':
      return <Upload className={`${cls} text-brand-magenta`} />;
    case 'packing_slip_created':
      return <Package className={`${cls} text-amber-600`} />;
    case 'order_updated':
      return <Edit3 className={`${cls} text-muted-foreground`} />;
    default:
      return <Info className={`${cls} text-muted-foreground`} />;
  }
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminOrderHistoryView({ orderId }: Props) {
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('order_history')
          .select('*')
          .eq('order_id', orderId)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (!cancelled) setHistory(data || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load history.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading history…</p>;
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
    );
  }

  return (
    <ol className="divide-y divide-border">
      {history.map((entry) => (
        <li key={entry.id} className="py-3 flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0">{actionIcon(entry.action_type)}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <span className="text-sm font-medium text-foreground">
                {ACTION_LABELS[entry.action_type] || entry.action_type}
              </span>
              <Badge variant={ROLE_VARIANT[entry.changed_by_role] || 'muted'} className="text-[10px]">
                {entry.changed_by_role}
              </Badge>
            </div>

            {entry.action_type === 'status_change' && entry.status_from && entry.status_to && (
              <div className="flex items-center flex-wrap gap-2 mt-1.5">
                <StatusBadge status={entry.status_from} />
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <StatusBadge status={entry.status_to} />
              </div>
            )}

            {entry.action_type.startsWith('document_') && entry.document_filename && (
              <p className="text-sm text-muted-foreground mt-1">
                <span className="font-medium text-foreground">File:</span>{' '}
                {entry.document_filename}
                {entry.document_type && (
                  <span className="ml-2 text-xs">({entry.document_type})</span>
                )}
              </p>
            )}

            {entry.notes && (
              <p className="text-sm text-muted-foreground mt-1">{entry.notes}</p>
            )}

            {entry.metadata && Object.keys(entry.metadata).length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                {entry.metadata.file_size && (
                  <span>{formatNumber(entry.metadata.file_size / 1024 / 1024, 2)} MB</span>
                )}
                {entry.metadata.description && (
                  <span className="ml-2">{entry.metadata.description}</span>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-2">
              By {entry.changed_by_name} · {formatDate(entry.created_at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
