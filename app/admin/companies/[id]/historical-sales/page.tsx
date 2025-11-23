'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import Link from 'next/link';
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Button,
  Input,
  IconButton,
} from '../../../../components/MaterialTailwind';
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  ArrowLeftIcon,
} from '@heroicons/react/24/outline';

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
  const router = useRouter();
  const companyId = params.id as string;

  const [company, setCompany] = useState<Company | null>(null);
  const [sales, setSales] = useState<HistoricalSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    sale_date: '',
    amount: '',
  });

  useEffect(() => {
    if (!companyId) return;
    fetchCompany();
    fetchSales();
  }, [companyId]);

  const fetchCompany = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name')
        .eq('id', companyId)
        .single();

      if (error) throw error;
      setCompany(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchSales = async () => {
    try {
      const { data, error } = await supabase
        .from('historical_sales')
        .select('id, sale_date, amount')
        .eq('company_id', companyId)
        .order('sale_date', { ascending: false });

      if (error) throw error;
      setSales(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setFormData({ sale_date: '', amount: '' });
    setEditingId(null);
    setShowAddForm(true);
  };

  const handleEdit = (sale: HistoricalSale) => {
    setFormData({
      sale_date: sale.sale_date,
      amount: sale.amount.toString(),
    });
    setEditingId(sale.id);
    setShowAddForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this historical sale entry?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('historical_sales')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Recalculate target periods
      await fetch('/api/target-periods/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });

      fetchSales();
    } catch (err: any) {
      alert('Error deleting entry: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.sale_date || !formData.amount) {
      alert('Please fill in all fields');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (isNaN(amount)) {
      alert('Amount must be a valid number');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      if (editingId) {
        // Update existing
        const { error } = await supabase
          .from('historical_sales')
          .update({
            sale_date: formData.sale_date,
            amount: amount,
          })
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('historical_sales')
          .insert({
            company_id: companyId,
            sale_date: formData.sale_date,
            amount: amount,
            created_by: session.user.id,
          });

        if (error) throw error;
      }

      // Recalculate target periods
      await fetch('/api/target-periods/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });

      setShowAddForm(false);
      setFormData({ sale_date: '', amount: '' });
      setEditingId(null);
      fetchSales();
    } catch (err: any) {
      alert('Error saving entry: ' + err.message);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <p>Loading...</p>
      </div>
    );
  }

  if (error && !company) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href="/admin/companies"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Companies
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/admin/companies/${companyId}`}
            className="text-gray-600 hover:text-gray-800"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">
              Historical Sales - {company?.company_name}
            </h2>
            <Typography
              variant="small"
              color="gray"
              className="mt-1"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              Manage historical sales data for goal tracking
            </Typography>
          </div>
        </div>
        <Button
          onClick={handleAdd}
          className="flex items-center gap-2"
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          <PlusIcon className="h-5 w-5" />
          Add Entry
        </Button>
      </div>

      {showAddForm && (
        <Card
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          <CardHeader
            floated={false}
            shadow={false}
            className="rounded-none"
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            <Typography
              variant="h6"
              color="blue-gray"
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              {editingId ? 'Edit Historical Sale' : 'Add Historical Sale'}
            </Typography>
          </CardHeader>
          <CardBody
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Input
                  type="date"
                  label="Sale Date"
                  value={formData.sale_date}
                  onChange={(e) => setFormData({ ...formData, sale_date: e.target.value })}
                  required
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                  crossOrigin={undefined}
                />
                <Typography
                  variant="small"
                  color="gray"
                  className="mt-1"
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  Select the first day of the month (e.g., 01/01/2023 for January 2023)
                </Typography>
              </div>
              <div>
                <Input
                  type="number"
                  label="Amount"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  required
                  step="0.01"
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                  crossOrigin={undefined}
                />
                <Typography
                  variant="small"
                  color="gray"
                  className="mt-1"
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  Enter positive amount for sales or negative amount for credits/refunds
                </Typography>
              </div>
              <div className="flex gap-2">
                <Button
                  type="submit"
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  {editingId ? 'Update' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={() => {
                    setShowAddForm(false);
                    setFormData({ sale_date: '', amount: '' });
                    setEditingId(null);
                  }}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      <Card
        placeholder={undefined}
        onPointerEnterCapture={undefined}
        onPointerLeaveCapture={undefined}
      >
        <CardHeader
          floated={false}
          shadow={false}
          className="rounded-none"
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          <Typography
            variant="h6"
            color="blue-gray"
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            Historical Sales ({sales.length} entries)
          </Typography>
        </CardHeader>
        <CardBody
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          {sales.length === 0 ? (
            <div className="text-center py-8">
              <Typography
                color="gray"
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
              >
                No historical sales data found. Click "Add Entry" to add data.
              </Typography>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sales.map((sale) => (
                    <tr key={sale.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatDate(sale.sale_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(sale.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end gap-2">
                          <IconButton
                            variant="text"
                            color="blue-gray"
                            size="sm"
                            onClick={() => handleEdit(sale)}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <PencilIcon className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            variant="text"
                            color="red"
                            size="sm"
                            onClick={() => handleDelete(sale.id)}
                            placeholder={undefined}
                            onPointerEnterCapture={undefined}
                            onPointerLeaveCapture={undefined}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

