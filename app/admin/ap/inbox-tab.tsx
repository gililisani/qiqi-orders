'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Upload, X } from 'lucide-react';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { supabase } from '../../../lib/supabaseClient';
import { formatDateTime } from '../../../lib/formatters';
import { useToast } from '../../components/ui/ToastProvider';
import { Card, CardContent } from '../../components/qq/card';
import { Button } from '../../components/qq/button';
import { Input } from '../../components/qq/input';
import { Badge } from '../../components/qq/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/qq/table';
import { cn } from '../../../lib/utils';
import { money, STATUS } from './format';

interface ApDocument {
  id: string;
  source: 'email' | 'upload';
  email_from: string | null;
  email_subject: string | null;
  file_name: string | null;
  status: string;
  vendor_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  error: string | null;
  created_at: string;
  attachments: Array<{ id: string; file_name: string | null; document_type: string | null }> | null;
}

const GROUPS = [
  { key: 'open', label: 'Open' },
  { key: 'posted', label: 'Posted' },
  { key: 'closed', label: 'Rejected & other' },
  { key: 'all', label: 'All' },
];

/** Upload one file: one-time link → straight to private storage → register. */
async function uploadOne(file: File): Promise<{ duplicate: boolean }> {
  const start = await fetchWithAuth('/api/ap/documents/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
  });
  const link = await start.json();
  if (!start.ok) throw new Error(link.error || 'Could not start the upload.');
  const { error } = await supabase.storage.from('ap-documents').uploadToSignedUrl(link.path, link.token, file, {
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  const done = await fetchWithAuth('/api/ap/documents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: link.path, fileName: file.name }),
  });
  const json = await done.json();
  if (!done.ok) throw new Error(json.error || 'Could not save the upload.');
  return { duplicate: !!json.duplicate };
}

export function InboxTab() {
  const toast = useToast();
  const [group, setGroup] = useState('open');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [docs, setDocs] = useState<ApDocument[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<Array<{ name: string; state: 'uploading' | 'done' | 'duplicate' | 'error'; message?: string }>>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  const load = useCallback(async (append: string | null = null) => {
    const mine = ++seq.current;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ group });
      if (query) qs.set('q', query);
      if (append) qs.set('before', append);
      const res = await fetchWithAuth(`/api/ap/documents?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load.');
      if (mine !== seq.current) return;
      setDocs((prev) => (append ? [...(prev ?? []), ...json.documents] : json.documents));
      setNext(json.next);
      setError(null);
    } catch (e: any) {
      if (mine === seq.current) setError(e.message);
    } finally {
      if (mine === seq.current) setBusy(false);
    }
  }, [group, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setQuery(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // While invoices are being read, refresh every few seconds (stops on its own).
  const inFlight = (docs ?? []).some((d) => d.status === 'received' || d.status === 'reading');
  useEffect(() => {
    if (!inFlight) return;
    const t = setInterval(() => load(), 4000);
    const stop = setTimeout(() => clearInterval(t), 180_000);
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [inFlight, load]);

  const onFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(list.map((f) => ({ name: f.name, state: 'uploading' })));
    let ok = 0;
    for (const [i, f] of list.entries()) {
      try {
        const r = await uploadOne(f);
        ok += r.duplicate ? 0 : 1;
        setUploading((u) => u.map((x, j) => (j === i ? { ...x, state: r.duplicate ? 'duplicate' : 'done' } : x)));
      } catch (e: any) {
        setUploading((u) => u.map((x, j) => (j === i ? { ...x, state: 'error', message: e.message } : x)));
      }
    }
    if (ok) toast.success(`${ok} invoice${ok === 1 ? '' : 's'} uploaded.`);
    load();
  };

  return (
    <div className="mt-6 space-y-6">
      <Card
        className={cn('border-dashed transition-colors', dragOver && 'border-foreground bg-secondary')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
      >
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Drop invoice PDFs here, or</p>
          <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
            Choose files
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {uploading.length > 0 && (
            <ul className="mt-2 w-full max-w-md space-y-1 text-left text-xs">
              {uploading.map((u, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="truncate">{u.name}</span>
                  <span className={cn('shrink-0', u.state === 'error' ? 'text-brand-magenta' : 'text-muted-foreground')}>
                    {u.state === 'uploading' ? 'Uploading…' : u.state === 'done' ? 'Uploaded' : u.state === 'duplicate' ? 'Already uploaded' : u.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {GROUPS.map((g) => (
            <Button key={g.key} size="sm" variant={group === g.key ? 'default' : 'outline'} onClick={() => setGroup(g.key)}>
              {g.label}
            </Button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setSearchInput('')}
            placeholder="Search file, sender, invoice #"
            aria-label="Search invoices"
            className="h-9 pl-9 pr-8"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className={cn('pt-6 transition-opacity', busy && 'opacity-60')}>
          {error ? (
            <p className="text-sm text-muted-foreground">Unavailable right now: {error}</p>
          ) : docs === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : docs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {query ? `No invoices match “${query}”.` : 'Nothing here yet.'}
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Received</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Invoice #</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{formatDateTime(d.created_at)}</TableCell>
                      <TableCell className="max-w-64">
                        <div className="truncate font-medium">{d.file_name ?? d.email_subject ?? '—'}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {d.source === 'email' ? `Email from ${d.email_from ?? 'unknown'}` : 'Uploaded'}
                          {d.attachments?.length
                            ? ` · + ${d.attachments.map((a) => (a.document_type === 'receipt' ? 'receipt' : 'copy')).join(', ')}`
                            : ''}
                        </div>
                      </TableCell>
                      <TableCell>{d.vendor_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>{d.invoice_number ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.total != null ? money(d.total, d.currency) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS[d.status]?.variant ?? 'muted'}>{STATUS[d.status]?.label ?? d.status}</Badge>
                        {d.error && <div className="mt-1 max-w-56 truncate text-xs text-brand-magenta">{d.error}</div>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {next && (
                <div className="mt-4 flex justify-center">
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => load(next)}>
                    Load older
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
