'use client';

/**
 * Regulatory & Compliance library, admin side — upload MSDS, COAs,
 * ingredient lists and certificates, per product or general, in categories.
 * Files live in the private compliance-docs bucket; partners download via
 * signed URLs from their own Compliance page.
 */

import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatters';

import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Badge } from '../../components/qq/badge';
import { Input } from '../../components/qq/input';
import { FormField } from '../../components/qq/form-field';
import { Alert, AlertDescription } from '../../components/qq/alert';
import { EmptyState } from '../../components/qq/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/qq/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../components/qq/table';
import { useToast } from '../../components/ui/ToastProvider';
import { useConfirm } from '../../components/ui/ConfirmProvider';

const COMPLIANCE_CATEGORIES = [
  'MSDS',
  'COA',
  'Ingredients',
  'Certificate',
  'Regulatory',
  'Other',
] as const;

interface ComplianceDoc {
  id: string;
  title: string;
  category: string;
  storage_path: string;
  file_name: string;
  created_at: string;
  product: { id: number; item_name: string | null } | null;
}

interface ProductOption {
  id: number;
  item_name: string | null;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

export default function AdminCompliancePage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload form
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<string>('MSDS');
  const [productId, setProductId] = useState<string>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [docsRes, productsRes] = await Promise.all([
      supabase
        .from('compliance_documents')
        .select('id, title, category, storage_path, file_name, created_at, product:Products(id, item_name)')
        .order('created_at', { ascending: false }),
      supabase.from('Products').select('id, item_name').order('item_name'),
    ]);
    if (docsRes.error) setError(docsRes.error.message);
    else setDocs((docsRes.data as unknown as ComplianceDoc[]) || []);
    setProducts((productsRes.data as ProductOption[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title.trim()) {
      setError('Title and a file are required.');
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const path = `${crypto.randomUUID()}/${sanitizeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage
        .from('compliance-docs')
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from('compliance_documents').insert({
        title: title.trim(),
        category,
        product_id: productId ? Number(productId) : null,
        storage_path: path,
        file_name: file.name,
        file_size: file.size,
        content_type: file.type || null,
        created_by: user?.id ?? null,
      });
      if (insErr) throw insErr;

      toast.success('Document uploaded.');
      setTitle('');
      setFile(null);
      const input = document.getElementById('compliance-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await load();
    } catch (err: any) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: ComplianceDoc) => {
    const { data, error: err } = await supabase.storage
      .from('compliance-docs')
      .createSignedUrl(doc.storage_path, 60);
    if (err || !data?.signedUrl) {
      toast.error(err?.message || 'Could not create download link.');
      return;
    }
    window.open(data.signedUrl, '_blank');
  };

  const handleDelete = async (doc: ComplianceDoc) => {
    const ok = await confirm({
      title: 'Delete document?',
      description: `"${doc.title}" will no longer be available to partners.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const { error: rowErr } = await supabase
        .from('compliance_documents')
        .delete()
        .eq('id', doc.id);
      if (rowErr) throw rowErr;
      // Best-effort file cleanup — an orphaned file is harmless; a dangling
      // row (file gone, row kept) is what we must avoid, hence row first.
      await supabase.storage.from('compliance-docs').remove([doc.storage_path]);
      toast.success('Document deleted.');
      await load();
    } catch (err: any) {
      toast.error(err.message || 'Delete failed.');
    }
  };

  // Products with no documents at all — the admin's gap checklist.
  const coveredProductIds = new Set(docs.map((d) => d.product?.id).filter(Boolean));
  const uncovered = products.filter((p) => !coveredProductIds.has(p.id));

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Regulatory & Compliance"
        description="MSDS, COAs, ingredient lists and certificates — everything partners need, self-serve."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Upload document</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField label="Title" required>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Super Soaker Masque — MSDS (EN)"
                  required
                />
              </FormField>
              <FormField label="Category" required>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLIANCE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Product" helper="Leave empty for brand-level documents.">
                <Select
                  value={productId || 'none'}
                  onValueChange={(v) => setProductId(v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="General (no product)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">General (no product)</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.item_name || `#${p.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label htmlFor="compliance-file" className="block text-sm font-medium mb-2">
                  File
                </label>
                <input
                  id="compliance-file"
                  type="file"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-foreground file:text-background hover:file:opacity-90 cursor-pointer"
                />
              </div>
              <Button type="submit" loading={uploading} disabled={!file || !title.trim()}>
                <Upload className="h-4 w-4" />
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Library ({docs.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading…</p>
          ) : docs.length === 0 ? (
            <EmptyState
              title="No documents yet"
              description="Upload the first MSDS or certificate above."
              className="border-0 shadow-none"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="hidden md:table-cell">Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Uploaded</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {docs.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="text-sm font-medium">{d.title}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{d.category}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {d.product?.item_name || 'General'}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {formatDate(d.created_at)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownload(d)}
                          aria-label="Download"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(d)}
                          aria-label="Delete"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {!loading && uncovered.length > 0 && docs.length > 0 && (
        <p className="text-xs text-muted-foreground">
          No documents yet for: {uncovered.slice(0, 8).map((p) => p.item_name).filter(Boolean).join(', ')}
          {uncovered.length > 8 ? ` and ${uncovered.length - 8} more` : ''}.
        </p>
      )}
    </div>
  );
}
