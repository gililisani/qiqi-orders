'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { ReportFilters, FilterConfig } from '../../../components/reports/ReportFilters';
import { ReportTable, ColumnDef } from '../../../components/reports/ReportTable';
import { ExportButton } from '../../../components/reports/ExportButton';
import { ColumnDef as ExportColumnDef } from '../../../../lib/reportExport';
import dynamic from 'next/dynamic';

// Dynamically import charts with SSR disabled (ApexCharts requires window)
const BarChart = dynamic(() => import('../../../components/reports/charts/BarChart').then(mod => ({ default: mod.BarChart })), { ssr: false });
const LineChart = dynamic(() => import('../../../components/reports/charts/LineChart').then(mod => ({ default: mod.LineChart })), { ssr: false });
const PieChart = dynamic(() => import('../../../components/reports/charts/PieChart').then(mod => ({ default: mod.PieChart })), { ssr: false });
import Card from '../../../components/ui/Card';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface CompanyPerformanceData {
  company_id: string;
  company_name: string;
  netsuite_number: string;
  subsidiary: string;
  class: string;
  total_sales: number;
  order_count: number;
  average_order_value: number;
  support_fund_used: number;
  credit_earned: number;
  top_products: Array<{
    sku: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
}

export default function CompanyPerformanceReportPage() {
  const [data, setData] = useState<CompanyPerformanceData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Array<{ value: string; label: string }>>([]);
  const [subsidiaries, setSubsidiaries] = useState<Array<{ value: string; label: string }>>([]);
  const [classes, setClasses] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState({
    dateRange_start: null as string | null,
    dateRange_end: null as string | null,
    companyIds: null as string[] | null,
    subsidiaryIds: null as string[] | null,
    classIds: null as string[] | null,
  });

  // Fetch filter options
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const [companiesRes, subsidiariesRes, classesRes] = await Promise.all([
          supabase.from('companies').select('id, company_name').order('company_name'),
          supabase.from('subsidiaries').select('id, name').order('name'),
          supabase.from('classes').select('id, name').order('name'),
        ]);

        if (companiesRes.data) {
          setCompanies(companiesRes.data.map((c) => ({ value: c.id, label: c.company_name })));
        }
        if (subsidiariesRes.data) {
          setSubsidiaries(subsidiariesRes.data.map((s) => ({ value: s.id, label: s.name })));
        }
        if (classesRes.data) {
          setClasses(classesRes.data.map((c) => ({ value: c.id, label: c.name })));
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };

    fetchFilterOptions();
  }, []);

  // Fetch report data with debounce to prevent calls on every keystroke
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 500); // Wait 500ms after last change

    return () => clearTimeout(timeoutId);
  }, [filters]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.dateRange_start) params.append('startDate', filters.dateRange_start);
      if (filters.dateRange_end) params.append('endDate', filters.dateRange_end);
      if (filters.companyIds && filters.companyIds.length > 0) {
        params.append('companyIds', filters.companyIds.join(','));
      }
      if (filters.subsidiaryIds && filters.subsidiaryIds.length > 0) {
        params.append('subsidiaryIds', filters.subsidiaryIds.join(','));
      }
      if (filters.classIds && filters.classIds.length > 0) {
        params.append('classIds', filters.classIds.join(','));
      }

      const response = await fetch(`/api/reports/company-performance?${params.toString()}`);
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

  // Prepare chart data
  const top10Companies = data.slice(0, 10);
  const barChartData = {
    labels: top10Companies.map((d) => d.company_name),
    series: [
      {
        name: 'Total Sales',
        data: top10Companies.map((d) => d.total_sales),
      },
    ] as [{ name?: string; data: number[] }],
  };

  // For line chart, we'll show sales over time (simplified - showing by company order)
  const lineChartData = {
    labels: top10Companies.map((d) => d.company_name),
    series: [
      {
        name: 'Total Sales',
        data: top10Companies.map((d) => d.total_sales),
      },
    ] as { name?: string; data: number[] }[],
  };

  // Pie chart: Sales distribution by subsidiary
  const subsidiarySales = new Map<string, number>();
  data.forEach((d) => {
    const sub = d.subsidiary || 'Unknown';
    subsidiarySales.set(sub, (subsidiarySales.get(sub) || 0) + d.total_sales);
  });

  const pieChartData = {
    labels: Array.from(subsidiarySales.keys()),
    series: Array.from(subsidiarySales.values()),
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
      key: 'company_name',
      label: 'Company Name',
    },
    {
      key: 'netsuite_number',
      label: 'NetSuite #',
    },
    {
      key: 'subsidiary',
      label: 'Subsidiary',
    },
    {
      key: 'class',
      label: 'Class',
    },
    {
      key: 'total_sales',
      label: 'Total Sales',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'order_count',
      label: 'Order Count',
    },
    {
      key: 'average_order_value',
      label: 'Avg Order Value',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'support_fund_used',
      label: 'Support Funds Used',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'credit_earned',
      label: 'Credit Earned',
      format: (value) => formatCurrency(value),
    },
  ];

  const exportColumns: ExportColumnDef[] = [
    { key: 'company_name', label: 'Company Name' },
    { key: 'netsuite_number', label: 'NetSuite Number' },
    { key: 'subsidiary', label: 'Subsidiary' },
    { key: 'class', label: 'Class' },
    { key: 'total_sales', label: 'Total Sales', format: (value) => formatCurrency(value) },
    { key: 'order_count', label: 'Order Count' },
    { key: 'average_order_value', label: 'Average Order Value', format: (value) => formatCurrency(value) },
    { key: 'support_fund_used', label: 'Support Funds Used', format: (value) => formatCurrency(value) },
    { key: 'credit_earned', label: 'Credit Earned', format: (value) => formatCurrency(value) },
  ];

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/reports" className="text-gray-600 hover:text-gray-800">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Company Performance Report</h1>
            <p className="text-sm text-gray-600 mt-1">
              View sales trends, comparisons, and metrics by company with visualizations
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="company-performance-report"
            format="xlsx"
            startDate={filters.dateRange_start || undefined}
            endDate={filters.dateRange_end || undefined}
            disabled={loading || data.length === 0}
          />
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="company-performance-report"
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

      {/* Charts Section */}
      {!loading && data.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card header={<h3 className="font-semibold">Sales by Company (Top 10)</h3>}>
            <BarChart
              height={350}
              series={barChartData.series}
              labels={barChartData.labels}
              colors={['#3b82f6']}
              options={{
                xaxis: {
                  categories: barChartData.labels,
                },
              }}
            />
          </Card>

          <Card header={<h3 className="font-semibold">Sales Trends</h3>}>
            <LineChart
              height={350}
              series={lineChartData.series}
              colors={['#10b981']}
              options={{
                xaxis: {
                  categories: lineChartData.labels,
                },
              }}
            />
          </Card>

          <Card header={<h3 className="font-semibold">Sales Distribution by Subsidiary</h3>}>
            <PieChart
              height={350}
              series={pieChartData.series}
              labels={pieChartData.labels}
              colors={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']}
            />
          </Card>
        </div>
      )}

      <ReportTable
        columns={columns}
        data={data}
        loading={loading}
        error={error}
        emptyMessage="No companies found matching the selected filters"
      />
    </div>
  );
}

