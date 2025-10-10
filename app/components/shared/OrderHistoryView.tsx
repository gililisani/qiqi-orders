'use client';

import { useState, useEffect } from 'react';
import { useSupabase } from '../../../lib/supabase-provider';
import Card from '../ui/Card';
import { Spinner, Typography } from '../MaterialTailwind';
import OrderStatusBadge from '../ui/OrderStatusBadge';
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

interface OrderHistoryViewProps {
  orderId: string;
  role: 'admin' | 'client';
}

export default function OrderHistoryView({ orderId, role }: OrderHistoryViewProps) {
  const { supabase } = useSupabase();
  const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
  // Loading handled by AdminLayout
  const [error, setError] = useState<string | null>(null);

  const actionTypeLabels: Record<string, string> = {
    order_created: 'Order Created',
    status_change: 'Status Changed',
    document_uploaded: 'Document Uploaded',
    packing_slip_created: 'Packing Slip Created',
    order_updated: 'Order Updated'
  };

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800',
    client: 'bg-blue-100 text-blue-800',
    system: 'bg-gray-100 text-gray-800'
  };

  const fetchHistory = async () => {
    try {
      // Loading handled by AdminLayout
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHistory(data || []);
    } catch (err: any) {
      console.error('Error fetching order history:', err);
      setError(err.message);
    } finally {
      // Loading handled by AdminLayout
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'order_created':
        return (
          <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'status_change':
        return (
          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
          </svg>
        );
      case 'document_uploaded':
        return (
          <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        );
      case 'packing_slip_created':
        return (
          <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        );
      case 'order_updated':
        return (
          <svg className="w-5 h-5 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        );
    }
  };

  const renderHistoryEntry = (entry: OrderHistoryEntry) => {
    const actionLabel = actionTypeLabels[entry.action_type] || entry.action_type;

    return (
      <div key={entry.id} className="flex items-start space-x-3 py-4 border-b border-gray-100 last:border-b-0">
        <div className="flex-shrink-0 mt-1">
          {getActionIcon(entry.action_type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 mb-1">
            <p className="text-sm font-medium text-gray-900 font-sans">
              {actionLabel}
            </p>
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${roleColors[entry.changed_by_role]}`}>
              {entry.changed_by_role}
            </span>
          </div>

          {/* Status Change Details */}
          {entry.action_type === 'status_change' && entry.status_from && entry.status_to && (
            <div className="flex items-center space-x-2 mb-2">
              <OrderStatusBadge status={entry.status_from} />
              <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <OrderStatusBadge status={entry.status_to} />
            </div>
          )}

          {/* Document Upload Details */}
          {entry.action_type === 'document_uploaded' && entry.document_filename && (
            <div className="mb-2">
              <p className="text-sm text-gray-600 font-sans">
                <span className="font-medium">File:</span> {entry.document_filename}
                {entry.document_type && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({entry.document_type})
                  </span>
                )}
              </p>
            </div>
          )}

          {/* Notes */}
          {entry.notes && (
            <p className="text-sm text-gray-600 mb-2 font-sans">{entry.notes}</p>
          )}

          {/* Metadata */}
          {entry.metadata && Object.keys(entry.metadata).length > 0 && (
            <div className="text-xs text-gray-500">
              {entry.metadata.file_size && (
                <span>Size: {formatNumber(entry.metadata.file_size / 1024 / 1024, 2)} MB</span>
              )}
              {entry.metadata.description && (
                <span className="ml-2">Description: {entry.metadata.description}</span>
              )}
            </div>
          )}

          <div className="flex items-center space-x-4 text-xs text-gray-500 mt-2">
            <span>By {entry.changed_by_name}</span>
            <span>•</span>
            <span>{formatDate(entry.created_at)}</span>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    fetchHistory();
  }, [orderId]);

  // Let AdminLayout handle loading - no separate loading state needed

  return (
    <Card>
      <div className="px-6 py-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-6 font-sans">
          Order History & Activity
        </h3>

        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-red-800 text-sm font-sans">{error}</p>
          </div>
        )}

        {history.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 48 48">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-gray-500 font-sans">No activity recorded yet</p>
            <p className="text-sm text-gray-400 mt-1 font-sans">
              Order history will appear here as changes are made
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {history.map(renderHistoryEntry)}
          </div>
        )}
      </div>
    </Card>
  );
}
