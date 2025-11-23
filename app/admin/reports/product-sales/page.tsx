'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { ReportFilters, FilterConfig } from '../../../components/reports/ReportFilters';
import { ReportTable, ColumnDef } from '../../../components/reports/ReportTable';
import { ExportButton, ColumnDef as ExportColumnDef } from '../../../components/reports/ExportButton';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface ProductSalesData {
  product_id: string;
  sku: string;
  product_name: string;
  category_name: string;
  quantity_sold: number;
  total_revenue: number;
  order_count: number;
  average_price: number;
}

export default function ProductSalesReportPage() {
  const [data, setData] = useState<ProductSalesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Array<{ value: string; label: string }>>([]);
  const [categories, setCategories] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState({
    dateRange_start: null as string | null,
    dateRange_end: null as string | null,
    companyIds: null as string[] | null,
    categoryIds: null as string[] | null,
  });

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [companiesRes, categoriesRes] = await Promise.all([
          supabase.from('companies').select('id, company_name').order('company_name'),
          supabase.from('categories').select('id, name').order('name'),
        ]);

        if (companiesRes.data) {
          setCompanies(companiesRes.data.map((c) => ({ value: c.id, label: c.company_name })));
        }
        if (categoriesRes.data) {
          setCategories(categoriesRes.data.map((c) => ({ value: c.id, label: c.name })));
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };

    fetchFilterOptions();
  }, []);

  // Fetch report data
  useEffect(() => {
    fetchData();
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.dateRange_start) {
        params.append('startDate', filters.dateRange_start);
      }
      if (filters.dateRange_end) {
        params.append('endDate', filters.dateRange_end);
      }
      if (filters.companyIds && filters.companyIds.length > 0) {
        params.append('companyIds', filters.companyIds.join(','));
      }
      if (filters.categoryIds && filters.categoryIds.length > 0) {
        params.append('categoryIds', filters.categoryIds.join(','));
      }

      const response = await fetch(`/api/reports/product-sales?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch report data');
      }

      setData(result.data || []);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filterConfigs: FilterConfig[] = [
    {
      type: 'dateRange',
      key: 'dateRange',
      label: 'Date Range',
      placeholder: 'Select date range',
    },
    {
      type: 'multiSelect',
      key: 'companyIds',
      label: 'Company',
      options: companies,
      placeholder: 'Select companies',
    },
    {
      type: 'multiSelect',
      key: 'categoryIds',
      label: 'Category',
      options: categories,
      placeholder: 'Select categories',
    },
  ];

  const columns: ColumnDef[] = [
    {
      key: 'sku',
      label: 'SKU',
    },
    {
      key: 'product_name',
      label: 'Product Name',
    },
    {
      key: 'category_name',
      label: 'Category',
    },
    {
      key: 'quantity_sold',
      label: 'Quantity Sold',
      format: (value) => value.toLocaleString(),
    },
    {
      key: 'total_revenue',
      label: 'Total Revenue',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'order_count',
      label: 'Order Count',
    },
    {
      key: 'average_price',
      label: 'Average Price',
      format: (value) => formatCurrency(value),
    },
  ];

  const exportColumns: ExportColumnDef[] = [
    { key: 'sku', label: 'SKU' },
    { key: 'product_name', label: 'Product Name' },
    { key: 'category_name', label: 'Category' },
    { key: 'quantity_sold', label: 'Quantity Sold', format: (value) => value.toLocaleString() },
    { key: 'total_revenue', label: 'Total Revenue', format: (value) => formatCurrency(value) },
    { key: 'order_count', label: 'Order Count' },
    { key: 'average_price', label: 'Average Price', format: (value) => formatCurrency(value) },
  ];

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/reports" className="text-gray-600 hover:text-gray-800">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Product Sales Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              View top products, sales by product, quantity sold, and revenue
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="product-sales-report"
            format="xlsx"
            startDate={filters.dateRange_start || undefined}
            endDate={filters.dateRange_end || undefined}
            disabled={loading || data.length === 0}
          />
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="product-sales-report"
            format="csv"
            startDate={filters.dateRange_start || undefined}
            endDate={filters.dateRange_end || undefined}
            disabled={loading || data.length === 0}
          />
        </div>
      </div>

      <ReportFilters
        filters={filterConfigs}
        values={filters}
        onChange={handleFilterChange}
        loading={loading}
      />

      <ReportTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        emptyMessage="No products found matching the selected filters"
      />
    </div>
  );
}

