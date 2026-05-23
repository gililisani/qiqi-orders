'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2 } from 'lucide-react';

import { supabase } from '../../../../../lib/supabaseClient';
import { PageHeader } from '../../../../components/qq/page-header';
import { Card } from '../../../../components/qq/card';
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
}

interface Company {
  id: string;
  company_name: string;
}

export default function CompanyHistoricalSalesPage() {
  const params = useParams();
  const companyId = params.id as string;
  const toast = useToast();
  const confirm = useConfirm();

  const [company, setCompany] = useState<Company | null>(null);
  const [sales, setSales] = useState<HistoricalSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ sale_date: '', amount: '' });

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const [companyRes, salesRes] = await Promise.all([
          supabase.from('companies').select('id, company_name').eq('id', companyId).single(),
          supabase
            .from('historical_sales')
            .select('id, sale_date, amount')
            .eq('company_id', companyId)
            .order('sale_date', { ascending: false }),
        ]);
        if (companyRes.error) throw companyRes.error;
        if (salesRes.error) throw salesRes.error;
        setCompany(companyRes.data);
        setSales(salesRes.data || []);
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
      .select('id, sale_date, amount')
      .eq('company_id', companyId)
      .order('sale_date', { ascending: false });
    if (!error) setSales(data || []);
  };

  const recalcTargets = async () => {
    try {
      await fetch('/api/target-periods/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });
    } catch {
      /* non-fatal */
    }
  };

  const openAdd = () => {
    setFormData({ sale_date: '', amount: '' });
    setEditingId(null);
    setFormError(null);
    setDialogOpen(true);
  };

  const openEdit = (sale: HistoricalSale) => {
    setFormData({ sale_date: sale.sale_date, amount: sale.amount.toString() });
    setEditingId(sale.id);
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.sale_date || !formData.amount) {
      setFormError('Please fill in all fields.');
      return;
    }
    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) {
      setFormError('Amount must be a valid number.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      if (editingId) {
        const { error } = await supabase
          .from('historical_sales')
          .update({ sale_date: formData.sale_date, amount })
          .eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('historical_sales').insert({
          company_id: companyId,
          sale_date: formData.sale_date,
          amount,
          created_by: session.user.id,
        });
        if (error) throw error;
      }

      await recalcTargets();
      await refreshSales();
      toast.success(editingId ? 'Entry updated.' : 'Entry added.');
      setDialogOpen(false);
      setEditingId(null);
      setFormData({ sale_date: '', amount: '' });
    } catch (err: any) {
      setFormError(err.message || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (sale: HistoricalSale) => {
    const ok = await confirm({
      title: 'Delete historical sale?',
      description: `Remove the ${formatDate(sale.sale_date)} entry (${formatCurrency(sale.amount)}). This cannot be undone.`,
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

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

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
            ? `Manage prior-period sales for ${company.company_name} — used for goal tracking.`
            : undefined
        }
        actions={
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" /> Add entry
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        {sales.length === 0 ? (
          <EmptyState
            title="No historical sales yet"
            description="Add prior-period sales to enable goal tracking against target periods."
            action={
              <Button size="sm" onClick={openAdd}>
                <Plus className="h-4 w-4" /> Add entry
              </Button>
            }
            className="border-0 shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead className="w-24 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">{formatDate(sale.sale_date)}</TableCell>
                  <TableCell className="font-mono text-sm">{formatCurrency(sale.amount)}</TableCell>
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
              <FormField
                label="Sale date"
                required
                helper="Select the first day of the month (e.g. 01/01/2023 for January 2023)."
              >
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
    </div>
  );
}
