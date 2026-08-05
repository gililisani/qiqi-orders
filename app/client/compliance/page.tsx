'use client';

/**
 * Regulatory & Compliance — partner side. MSDS, COAs, ingredient lists and
 * certificates, filterable by product and category, downloaded via signed
 * URLs. Saves everyone the "can you send me the MSDS for…" emails.
 */

import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { formatDate } from '../../../lib/formatters';

import { PageHeader } from '../../components/qq/page-header';
import { Card, CardContent } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Badge } from '../../components/qq/badge';
import { Input } from '../../components/qq/input';
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

interface ComplianceDoc {
  id: string;
  title: string;
  category: string;
  storage_path: string;
  file_name: string;
  created_at: string;
  product: { item_name: string | null } | null;
}

export default function ClientCompliancePage() {
  const toast = useToast();
  const [docs, setDocs] = useState<ComplianceDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');

  useEffect(() => {
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('compliance_documents')
          .select('id, title, category, storage_path, file_name, created_at, product:Products(item_name)')
          .order('created_at', { ascending: false });
        if (err) throw err;
        setDocs((data as unknown as ComplianceDoc[]) || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load documents.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(docs.map((d) => d.category))).sort(),
    [docs],
  );

  const visible = docs.filter((d) => {
    if (category !== 'all' && d.category !== category) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      d.title.toLowerCase().includes(q) ||
      (d.product?.item_name ?? '').toLowerCase().includes(q)
    );
  });

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

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title="Regulatory & Compliance"
        description="MSDS, certificates, ingredient lists and other regulatory documents."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by product or title…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground p-6">Loading…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              title={docs.length === 0 ? 'No documents yet' : 'No results'}
              description={
                docs.length === 0
                  ? 'Regulatory documents will appear here as they are published.'
                  : 'Try a different search or category.'
              }
              className="border-0 shadow-none"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="hidden md:table-cell">Product</TableHead>
                  <TableHead className="hidden sm:table-cell">Published</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((d) => (
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
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownload(d)}
                        aria-label={`Download ${d.title}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
