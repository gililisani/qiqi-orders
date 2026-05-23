'use client';

/**
 * AdminOrderDocumentsView — admin-only documents list for an order.
 *
 * Forked from app/components/shared/OrderDocumentsView. Removes the inner
 * Card wrapper (parent provides), removes the duplicate heading (parent
 * uses SectionHeader). Uses qq primitives + Dialog viewer + Confirm for
 * delete. Mobile-responsive — document rows stack vertically on phones
 * so nothing overflows.
 */

import { useEffect, useState } from 'react';
import { FileText, Download, Eye, Trash2 } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatNumber } from '../../../lib/formatters';

import { Button } from '../qq/button';
import { Badge } from '../qq/badge';
import { Alert, AlertDescription } from '../qq/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../qq/dialog';
import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';

interface OrderDocument {
  id: string;
  document_type: string;
  filename: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by_name: string;
  description?: string;
  created_at: string;
}

interface Props {
  orderId: string;
}

const TYPE_LABELS: Record<string, string> = {
  invoice: 'Invoice',
  sales_order: 'Sales Order',
  other: 'Other',
};
const TYPE_VARIANT: Record<string, 'success' | 'accent' | 'muted'> = {
  invoice: 'success',
  sales_order: 'accent',
  other: 'muted',
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return formatNumber(bytes / Math.pow(k, i), 2) + ' ' + sizes[i];
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

export default function AdminOrderDocumentsView({ orderId }: Props) {
  const toast = useToast();
  const confirm = useConfirm();

  const [documents, setDocuments] = useState<OrderDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [viewingDocument, setViewingDocument] = useState<OrderDocument | null>(null);
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ------------------------------------------------------------------------
  async function fetchDocuments() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('order_documents')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setDocuments(data || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load documents.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // ------------------------------------------------------------------------
  async function getSignedUrl(doc: OrderDocument): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('Not authenticated');
    const res = await fetch(
      `/api/orders/${orderId}/documents/${doc.id}/signed-url`,
      { headers: { Authorization: `Bearer ${session.access_token}` } }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to get document URL');
    }
    const { url } = await res.json();
    return url;
  }

  async function handleView(doc: OrderDocument) {
    try {
      const url = await getSignedUrl(doc);
      setDocumentUrl(url);
      setViewingDocument(doc);
    } catch (err: any) {
      toast.error(`Failed to load document: ${err.message}`);
    }
  }

  async function handleDownload(doc: OrderDocument) {
    try {
      const url = await getSignedUrl(doc);
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      toast.error(`Failed to download document: ${err.message}`);
    }
  }

  async function handleDelete(doc: OrderDocument) {
    const ok = await confirm({
      title: 'Delete document?',
      description: `Delete "${doc.filename}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      requireExplicitConfirm: true,
    });
    if (!ok) return;

    setDeletingId(doc.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated.');

      const { data: profile } = await supabase
        .from('admins')
        .select('name')
        .eq('id', user.id)
        .single();
      const userName = profile?.name || user.email || 'Unknown';

      // Delete from storage (non-fatal)
      const { error: storageError } = await supabase.storage
        .from('order-documents')
        .remove([doc.file_path]);
      if (storageError) console.error('Storage deletion error:', storageError);

      const { error: dbError } = await supabase
        .from('order_documents')
        .delete()
        .eq('id', doc.id);
      if (dbError) throw dbError;

      // History log
      await supabase.from('order_history').insert({
        order_id: orderId,
        action_type: 'document_deleted',
        document_type: doc.document_type,
        document_filename: doc.filename,
        notes: `Document deleted: ${doc.filename}`,
        changed_by_id: user.id,
        changed_by_name: userName,
        changed_by_role: 'admin',
        metadata: {
          file_size: doc.file_size,
          mime_type: doc.mime_type,
          description: doc.description,
        },
      });

      await fetchDocuments();
      toast.success('Document deleted.');
    } catch (err: any) {
      toast.error(`Failed to delete: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  // ------------------------------------------------------------------------
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  }

  if (documents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
    );
  }

  return (
    <>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="space-y-2">
        {documents.map((doc) => (
          <li
            key={doc.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border border-border rounded-md hover:bg-secondary/50 transition-colors"
          >
            {/* Icon + filename + metadata */}
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center flex-wrap gap-2">
                  <span className="text-sm font-medium truncate">{doc.filename}</span>
                  <Badge variant={TYPE_VARIANT[doc.document_type] || 'muted'} className="text-[10px]">
                    {TYPE_LABELS[doc.document_type] || doc.document_type}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-2">
                  <span>{formatFileSize(doc.file_size)}</span>
                  <span>·</span>
                  <span className="truncate">By {doc.uploaded_by_name}</span>
                  <span className="hidden sm:inline">·</span>
                  <span className="hidden sm:inline">{formatDate(doc.created_at)}</span>
                </div>
                {doc.description && (
                  <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 sm:flex-shrink-0">
              <Button variant="outline" size="sm" onClick={() => handleView(doc)}>
                <Eye className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">View</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDownload(doc)}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(doc)}
                disabled={deletingId === doc.id}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{deletingId === doc.id ? 'Deleting…' : 'Delete'}</span>
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Viewer dialog */}
      <Dialog
        open={!!viewingDocument && !!documentUrl}
        onOpenChange={(open) => {
          if (!open) {
            setViewingDocument(null);
            setDocumentUrl(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="truncate">{viewingDocument?.filename}</DialogTitle>
              {viewingDocument && (
                <Button size="sm" variant="outline" onClick={() => handleDownload(viewingDocument)}>
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {documentUrl && (
              <iframe
                src={documentUrl}
                className="w-full h-full border-0"
                title={viewingDocument?.filename}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
