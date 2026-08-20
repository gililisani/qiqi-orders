'use client';

/**
 * Historical (pre-Hub) sales for one company — feeds annual-goal progress
 * and the support-fund snapshot in company performance.
 *
 * Two entry paths:
 *  - Import from NetSuite (preferred): per-invoice rows for a date range,
 *    with the SF discount read from the invoice; idempotent on re-import.
 *  - Manual entry for edge cases (no one-per-day restriction since v2).
 */

import { useEffect, useState } from 'react';
import { formatCurrency } from '../../../../../lib/formatters';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, DownloadCloud } from 'lucide-react';

import { supabase } from '../../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../../components/qq/page-header';
import { Card } from '../../../../components/qq/card';
import { Badge } from '../../../../components/qq/badge';
import { Button } from '../../../../components/qq/button';
import { Input } from '../../../../components/qq/input';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { EmptyState } from '../../../../components/qq/empty-state';
import { FormField } from '../../../../components/qq/form-field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../../components/qq/dialog';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../../components/qq/table';
import { useToast } from '../../../../components/ui/ToastProvider';
import { useConfirm } from '../../../../components/ui/ConfirmProvider';

interface HistoricalSale {
  id: string;
  sale_date: string;
  amount: number;
  support_fund: number | null;
  reference: string | null;
  source: string | null;
  items: Array<{ count: number }> | null;
}

interface Company {
  id: string;
  company_name: string;
  netsuite_internal_id: string | null;
}

interface PreviewRow {
  netsuite_invoice_id: string;
  reference: string;
  sale_date: string | null;
  amount: number;
  support_fund: number;
  itemCount: number;
  alreadyOrder: boolean;
  alreadyImported: boolean;
  selected: boolean;
}

const SALE_COLUMNS = 'id, sale_date, amount, support_fund, reference, source, items:historical_sale_items(count)';

export default function CompanyHistoricalSalesPage() {
  const params = useParams();
  const companyId = params.id as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [company, setCompany] = useState<Company | null>(null);
  const [sales, setSales] = useState<HistoricalSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Manual add/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    sale_date: '',
    amount: '',
    support_fund: '',
    reference: '',
  });

  // NetSuite import dialog
  const [importOpen, setImportOpen] = useState(false);
  const [importRange, setImportRange] = useState({ from: '', to: '' });
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const [companyRes, salesRes] = await Promise.all([
          supabase
            .from('companies')
            .select('id, company_name, netsuite_internal_id')
            .eq('id', companyId)
            .single(),
          supabase
            .from('historical_sales')
            .select(SALE_COLUMNS)
            .eq('company_id', companyId)
            .order('sale_date', { ascending: false }),
        ]);
        if (companyRes.error) throw companyRes.error;
        if (salesRes.error) throw salesRes.error;
        setCompany(companyRes.data);
        setSales((salesRes.data as HistoricalSale[]) || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load.');
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const refreshSales = async () => {
    const { data, error } = await supabase
      .from('historical_sales')
      .select(SALE_COLUMNS)
      .eq('company_id', companyId)
      .order('sale_date', { ascending: false });
    if (!error) setSales((data as HistoricalSale[]) || []);
  };

  const recalcTargets = async () => {
    try {
      // fetchWithAuth, not fetch — plain fetch 401'd silently and progress
      // never recalculated after historical-sales edits.
      const res = await fetchWithAuth('/api/target-periods/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        console.error('Target-period recalculation failed:', d.error || res.status);
      }
    } catch (err) {
      console.error('Target-period recalculation failed:', err);
    }
  };

  // ------------------------------------------------------------------
  // Manual entry
  // ------------------------------------------------------------------
  const openAdd = () => {
    setFormData({ sale_date: '', amount: '', support_fund: '', reference: '' });
    setEditingId(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (sale: HistoricalSale) => {
    setFormData({
      sale_date: sale.sale_date,
      amount: sale.amount.toString(),
      support_fund: sale.support_fund ? sale.support_fund.toString() : '',
      reference: sale.reference || '',
    });
    setEditingId(sale.id);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sale_date || !formData.amount) {
      setFormError('Date and amount are required.');
      return;
    }
    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) {
      setFormError('Amount must be a valid number.');
      return;
    }
    const supportFund = formData.support_fund ? parseFloat(formData.support_fund) : 0;
    if (isNaN(supportFund)) {
      setFormError('Support fund must be a valid number.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const fields = {
        sale_date: formData.sale_date,
        amount,
        support_fund: supportFund,
        reference: formData.reference.trim() || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from('historical_sales')
          .update(fields)
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('historical_sales').insert({
          company_id: companyId,
          ...fields,
          created_by: session.user.id,
        });
        if (error) throw error;
      }

      await recalcTargets();
      await refreshSales();
      toast.success(editingId ? 'Entry updated.' : 'Entry added.');
      setDialogOpen(false);
      setEditingId(null);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sale: HistoricalSale) => {
    const ok = await confirm({
      title: 'Delete historical sale?',
      description: `Remove ${sale.reference || formatDate(sale.sale_date)} (${formatCurrency(sale.amount)}). This cannot be undone.`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const { error } = await supabase.from('historical_sales').delete().eq('id', sale.id);
      if (error) throw error;
      await recalcTargets();
      await refreshSales();
      toast.success('Entry deleted.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry.');
    }
  };

  // ------------------------------------------------------------------
  // NetSuite import
  // ------------------------------------------------------------------
  const openImport = () => {
    setImportRange({ from: '', to: '' });
    setPreview(null);
    setImportError(null);
    setImportOpen(true);
  };

  const runPreview = async () => {
    if (!importRange.from || !importRange.to) {
      setImportError('Pick a from and to date.');
      return;
    }
    setPreviewing(true);
    setImportError(null);
    setPreview(null);
    try {
      const res = await fetchWithAuth('/api/admin/historical-sales/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, mode: 'preview', ...importRange }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Preview failed.');
      setPreview(
        (data.rows as Omit<PreviewRow, 'selected'>[]).map((r) => ({
          ...r,
          // Preselect only what's importable and new.
          selected: !r.alreadyOrder && !r.alreadyImported,
        }))
      );
    } catch (err: any) {
      setImportError(err.message || 'Preview failed.');
    } finally {
      setPreviewing(false);
    }
  };

  const runImport = async () => {
    const rows = (preview || []).filter((r) => r.selected && !r.alreadyOrder);
    if (rows.length === 0) {
      setImportError('Nothing selected to import.');
      return;
    }
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetchWithAuth('/api/admin/historical-sales/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, mode: 'import', rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Import failed.');
      await recalcTargets();
      await refreshSales();
      toast.success(
        `Imported ${data.imported} sale${data.imported === 1 ? '' : 's'} with ${data.items ?? 0} product line${data.items === 1 ? '' : 's'} from NetSuite.`
      );
      setImportOpen(false);
    } catch (err: any) {
      setImportError(err.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const setPreviewRow = (idx: number, patch: Partial<PreviewRow>) => {
    setPreview((prev) => (prev ? prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)) : prev));
  };

  const formatDate = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00Z`).toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });

  const totalAmount = sales.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalSf = sales.reduce((s, r) => s + (Number(r.support_fund) || 0), 0);
  const selectedCount = (preview || []).filter((r) => r.selected && !r.alreadyOrder).length;

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Link
          href="/admin/companies"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to companies
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href={`/admin/companies/${companyId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to company
        </Link>
      </div>

      <PageHeader
        title="Historical sales"
        description={
          company
            ? `Pre-Hub sales for ${company.company_name} — feeds goal tracking and the support-fund snapshot.`
            : undefined
        }
        actions={
          <>
            {company?.netsuite_internal_id && (
              <Button size="sm" onClick={openImport}>
                <DownloadCloud className="h-4 w-4" /> Import from NetSuite
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add manually
            </Button>
          </>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {sales.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:gap-4 max-w-lg">
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total sales</p>
            <p className="mt-1 text-xl font-semibold font-mono tabular-nums">
              {formatCurrency(totalAmount)}
            </p>
          </Card>
          <Card className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Support funds</p>
            <p className="mt-1 text-xl font-semibold font-mono tabular-nums">
              {formatCurrency(totalSf)}
            </p>
          </Card>
        </div>
      )}

      <Card>
        {sales.length === 0 ? (
          <EmptyState
            title="No historical sales yet"
            description={
              company?.netsuite_internal_id
                ? 'Import this company’s pre-Hub invoices from NetSuite, or add entries manually.'
                : 'Add prior-period sales to enable goal tracking against target periods.'
            }
            action={
              company?.netsuite_internal_id ? (
                <Button size="sm" onClick={openImport}>
                  <DownloadCloud className="h-4 w-4" /> Import from NetSuite
                </Button>
              ) : (
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Add entry
                </Button>
              )
            }
            className="border-0 shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Support fund</TableHead>
                <TableHead className="text-right">Items</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">{formatDate(sale.sale_date)}</TableCell>
                  <TableCell className="font-mono text-sm">{sale.reference || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(sale.amount)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {Number(sale.support_fund) ? formatCurrency(Number(sale.support_fund)) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-muted-foreground">
                    {sale.items?.[0]?.count || '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={sale.source === 'netsuite' ? 'accent' : 'muted'}>
                      {sale.source === 'netsuite' ? 'NetSuite' : 'Manual'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(sale)}
                        aria-label="Edit entry"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(sale)}
                        aria-label="Delete entry"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
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
      </Card>

      {/* Manual add/edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit} noValidate>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit historical sale' : 'Add historical sale'}</DialogTitle>
            </DialogHeader>

            {formError && (
              <Alert variant="destructive" className="mt-2">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-4 py-2">
              <FormField label="Sale date" required>
                <Input
                  type="date"
                  value={formData.sale_date}
                  onChange={(e) => setFormData((p) => ({ ...p, sale_date: e.target.value }))}
                  required
                />
              </FormField>
              <FormField
                label="Amount (USD)"
                required
                helper="Positive for sales, negative for credits or refunds."
              >
                <Input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData((p) => ({ ...p, amount: e.target.value }))}
                  required
                />
              </FormField>
              <FormField
                label="Support fund (USD)"
                helper="The support-fund value on this sale (the SF discount). Leave empty for none."
              >
                <Input
                  type="number"
                  step="0.01"
                  value={formData.support_fund}
                  onChange={(e) => setFormData((p) => ({ ...p, support_fund: e.target.value }))}
                />
              </FormField>
              <FormField label="Reference" helper="Optional — e.g. the NetSuite invoice number.">
                <Input
                  value={formData.reference}
                  onChange={(e) => setFormData((p) => ({ ...p, reference: e.target.value }))}
                />
              </FormField>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Update entry' : 'Save entry'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* NetSuite import */}
      <Dialog open={importOpen} onOpenChange={(o) => !importing && setImportOpen(o)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import historical sales from NetSuite</DialogTitle>
          </DialogHeader>

          {importError && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>{importError}</AlertDescription>
            </Alert>
          )}

          <div className="flex items-end gap-3 py-2">
            <FormField label="From" required>
              <Input
                type="date"
                value={importRange.from}
                onChange={(e) => setImportRange((p) => ({ ...p, from: e.target.value }))}
              />
            </FormField>
            <FormField label="To" required>
              <Input
                type="date"
                value={importRange.to}
                onChange={(e) => setImportRange((p) => ({ ...p, to: e.target.value }))}
              />
            </FormField>
            <Button onClick={runPreview} loading={previewing} className="mb-1">
              Preview
            </Button>
          </div>

          {preview && preview.length === 0 && (
            <p className="text-sm text-muted-foreground py-2">
              No NetSuite invoices found in this range.
            </p>
          )}

          {preview && preview.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                Support fund is read from the invoice&apos;s SF discount lines. Old invoices that
                gave support funds as free goods show 0 — type the value before importing.
                Product lines are imported automatically with each invoice (the Items count).
                Invoices already tracked as Hub orders can&apos;t be imported (they&apos;d double-count).
              </p>
              <div className="max-h-80 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right w-36">Support fund</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((row, idx) => (
                      <TableRow key={row.netsuite_invoice_id} className={row.alreadyOrder ? 'opacity-50' : ''}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={row.selected && !row.alreadyOrder}
                            disabled={row.alreadyOrder}
                            onChange={(e) => setPreviewRow(idx, { selected: e.target.checked })}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.sale_date ? formatDate(row.sale_date) : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">{row.reference}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatCurrency(row.amount)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 text-right font-mono"
                            value={row.support_fund}
                            disabled={row.alreadyOrder}
                            onChange={(e) =>
                              setPreviewRow(idx, { support_fund: parseFloat(e.target.value) || 0 })
                            }
                          />
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm text-muted-foreground">
                          {row.itemCount || '—'}
                        </TableCell>
                        <TableCell>
                          {row.alreadyOrder ? (
                            <Badge variant="warning">Hub order</Badge>
                          ) : row.alreadyImported ? (
                            <Badge variant="muted">Re-import</Badge>
                          ) : (
                            <Badge variant="success">New</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
              disabled={importing}
            >
              Cancel
            </Button>
            <Button
              onClick={runImport}
              loading={importing}
              disabled={!preview || selectedCount === 0}
            >
              Import {selectedCount > 0 ? selectedCount : ''} sale{selectedCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
