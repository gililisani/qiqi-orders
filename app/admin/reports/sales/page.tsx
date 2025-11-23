'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { ReportFilters, FilterConfig } from '../../../components/reports/ReportFilters';
import { ReportTable, ColumnDef } from '../../../components/reports/ReportTable';
import { ExportButton } from '../../../components/reports/ExportButton';
import { ColumnDef as ExportColumnDef } from '../../../../lib/reportExport';
import OrderStatusBadge from '../../../components/ui/OrderStatusBadge';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface SalesData {
  id: string;
  order_number: string;
  date: string;
  company_name: string;
  netsuite_number: string;
  status: string;
  total_value: number;
  items_count: number;
  subsidiary: string;
  class: string;
  support_fund_used: number;
  credit_earned: number;
}

const ORDER_STATUSES = [
  { value: 'Draft', label: 'Draft' },
  { value: 'Open', label: 'Open' },
  { value: 'In Process', label: 'In Process' },
  { value: 'Ready', label: 'Ready' },
  { value: 'Done', label: 'Done' },
  { value: 'Cancelled', label: 'Cancelled' },
];

export default function SalesReportPage() {
  const [data, setData] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Array<{ value: string; label: string }>>([]);
  const [subsidiaries, setSubsidiaries] = useState<Array<{ value: string; label: string }>>([]);
  const [classes, setClasses] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState({
    dateRange_start: null as string | null,
    dateRange_end: null as string | null,
    companyIds: null as string[] | null,
    statuses: null as string[] | null,
    subsidiaryIds: null as string[] | null,
    classIds: null as string[] | null,
  });

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        // Fetch companies
        const { data: companiesData } = await supabase
          .from('companies')
          .select('id, company_name')
          .order('company_name');

        if (companiesData) {
          setCompanies(
            companiesData.map((c) => ({
              value: c.id,
              label: c.company_name,
            }))
          );
        }

        // Fetch subsidiaries
        const { data: subsidiariesData } = await supabase
          .from('subsidiaries')
          .select('id, name')
          .order('name');

        if (subsidiariesData) {
          setSubsidiaries(
            subsidiariesData.map((s) => ({
              value: s.id,
              label: s.name,
            }))
          );
        }

        // Fetch classes
        const { data: classesData } = await supabase
          .from('classes')
          .select('id, name')
          .order('name');

        if (classesData) {
          setClasses(
            classesData.map((c) => ({
              value: c.id,
              label: c.name,
            }))
          );
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
      if (filters.statuses && filters.statuses.length > 0) {
        params.append('statuses', filters.statuses.join(','));
      }
      if (filters.subsidiaryIds && filters.subsidiaryIds.length > 0) {
        params.append('subsidiaryIds', filters.subsidiaryIds.join(','));
      }
      if (filters.classIds && filters.classIds.length > 0) {
        params.append('classIds', filters.classIds.join(','));
      }

      const response = await fetch(`/api/reports/sales?${params.toString()}`);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
      key: 'statuses',
      label: 'Status',
      options: ORDER_STATUSES,
      placeholder: 'Select statuses',
    },
    {
      type: 'multiSelect',
      key: 'subsidiaryIds',
      label: 'Subsidiary',
      options: subsidiaries,
      placeholder: 'Select subsidiaries',
    },
    {
      type: 'multiSelect',
      key: 'classIds',
      label: 'Class',
      options: classes,
      placeholder: 'Select classes',
    },
  ];

  const columns: ColumnDef[] = [
    {
      key: 'order_number',
      label: 'Order #',
    },
    {
      key: 'date',
      label: 'Date',
      format: (value) => formatDate(value),
    },
    {
      key: 'company_name',
      label: 'Company',
    },
    {
      key: 'netsuite_number',
      label: 'NetSuite #',
    },
    {
      key: 'status',
      label: 'Status',
      format: (value) => <OrderStatusBadge status={value} />,
    },
    {
      key: 'total_value',
      label: 'Total Value',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'items_count',
      label: 'Items',
    },
    {
      key: 'subsidiary',
      label: 'Subsidiary',
    },
    {
      key: 'class',
      label: 'Class',
    },
  ];

  const exportColumns: ExportColumnDef[] = [
    { key: 'order_number', label: 'Order Number' },
    { key: 'date', label: 'Date', format: (value) => formatDate(value) },
    { key: 'company_name', label: 'Company Name' },
    { key: 'netsuite_number', label: 'NetSuite Number' },
    { key: 'status', label: 'Status' },
    { key: 'total_value', label: 'Total Value', format: (value) => formatCurrency(value) },
    { key: 'items_count', label: 'Items Count' },
    { key: 'subsidiary', label: 'Subsidiary' },
    { key: 'class', label: 'Class' },
    { key: 'support_fund_used', label: 'Support Fund Used', format: (value) => formatCurrency(value) },
    { key: 'credit_earned', label: 'Credit Earned', format: (value) => formatCurrency(value) },
  ];

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/reports"
            className="text-gray-600 hover:text-gray-800"
          >
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sales Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              View orders filtered by date range, company, status, subsidiary, and class
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="sales-report"
            format="xlsx"
            startDate={filters.dateRange_start || undefined}
            endDate={filters.dateRange_end || undefined}
            disabled={loading || data.length === 0}
          />
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="sales-report"
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
        emptyMessage="No orders found matching the selected filters"
      />
    </div>
  );
}

