'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { ReportFilters, FilterConfig } from '../../../components/reports/ReportFilters';
import dynamic from 'next/dynamic';
import Card from '../../../components/ui/Card';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

// Dynamically import charts with SSR disabled (ApexCharts requires window)
const BarChart = dynamic(() => import('../../../components/reports/charts/BarChart').then(mod => ({ default: mod.BarChart })), { ssr: false });
const LineChart = dynamic(() => import('../../../components/reports/charts/LineChart').then(mod => ({ default: mod.LineChart })), { ssr: false });
const PieChart = dynamic(() => import('../../../components/reports/charts/PieChart').then(mod => ({ default: mod.PieChart })), { ssr: false });

interface PerformancesData {
  summary: {
    totalSales: number;
    totalSalesOrders: number;
    totalOpenOrders: number;
    totalOpenOrdersValue: number;
    totalClients: number;
    totalCreditEarned: number;
    totalCreditUsed: number;
  };
  monthlySales: Array<{ month: string; sales: number }>;
  dailySales: Array<{ date: string; sales: number }>;
  topClients: Array<{ companyName: string; sales: number }>;
  topProducts: Array<{ sku: string; name: string; sales: number }>;
}

export default function PerformancesReportPage() {
  const [data, setData] = useState<PerformancesData | null>(null);
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
  const [appliedFilters, setAppliedFilters] = useState(filters);

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

  // Fetch report data on mount and when appliedFilters change
  useEffect(() => {
    fetchData();
  }, [appliedFilters]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (appliedFilters.dateRange_start) params.append('startDate', appliedFilters.dateRange_start);
      if (appliedFilters.dateRange_end) params.append('endDate', appliedFilters.dateRange_end);
      if (appliedFilters.companyIds && appliedFilters.companyIds.length > 0) {
        params.append('companyIds', appliedFilters.companyIds.join(','));
      }
      if (appliedFilters.subsidiaryIds && appliedFilters.subsidiaryIds.length > 0) {
        params.append('subsidiaryIds', appliedFilters.subsidiaryIds.join(','));
      }
      if (appliedFilters.classIds && appliedFilters.classIds.length > 0) {
        params.append('classIds', appliedFilters.classIds.join(','));
      }

      const response = await fetch(`/api/reports/performances?${params.toString()}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch report data');
      }

      setData(result);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setData(null);
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

  const handleSubmit = () => {
    setAppliedFilters(filters);
  };

  const handleReset = () => {
    const resetFilters = {
      dateRange_start: null,
      dateRange_end: null,
      companyIds: null,
      subsidiaryIds: null,
      classIds: null,
    };
    setFilters(resetFilters);
    setAppliedFilters(resetFilters);
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

  // Prepare chart data
  const monthlyChartData = data?.monthlySales || [];
  const monthlyLabels = monthlyChartData.map(d => {
    const [year, month] = d.month.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  });
  const monthlySeries = monthlyChartData.map(d => d.sales);

  const dailyChartData = data?.dailySales || [];
  const dailyLabels = dailyChartData.map(d => {
    const [year, month] = d.date.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short' });
  });
  const dailySeries = dailyChartData.map(d => d.sales);

  const creditPieData = data ? [
    { label: 'Earned', value: data.summary.totalCreditEarned },
    { label: 'Used', value: data.summary.totalCreditUsed },
  ] : [];

  const topClientsData = data?.topClients || [];
  const topProductsData = data?.topProducts || [];

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/reports" className="text-gray-600 hover:text-gray-800">
            <ArrowLeftIcon className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Performances</h1>
            <p className="text-sm text-gray-600 mt-1">
              View sales trends, comparisons, and metrics with visualizations
            </p>
          </div>
        </div>
      </div>

      <ReportFilters
        filters={filterConfigs}
        values={filters}
        onChange={handleFilterChange}
        loading={loading}
        onSubmit={handleSubmit}
        onReset={handleReset}
        showButtons={true}
      />

      {error && (
        <Card>
          <div className="text-red-600 p-4">{error}</div>
        </Card>
      )}

      {loading && (
        <Card>
          <div className="text-center p-8">Loading...</div>
        </Card>
      )}

      {!loading && data && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total Sales</h3>
                <p className="text-3xl font-semibold text-gray-900">{formatCurrency(data.summary.totalSales)}</p>
                <p className="text-sm text-gray-500 mt-2">{data.summary.totalSalesOrders} orders (Done)</p>
              </div>
            </Card>
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total Open Orders</h3>
                <p className="text-3xl font-semibold text-gray-900">{formatCurrency(data.summary.totalOpenOrdersValue)}</p>
                <p className="text-sm text-gray-500 mt-2">{data.summary.totalOpenOrders} orders (In Process + Ready)</p>
              </div>
            </Card>
            <Card>
              <div className="p-6">
                <h3 className="text-sm font-medium text-gray-600 mb-2">Total Clients</h3>
                <p className="text-3xl font-semibold text-gray-900">{data.summary.totalClients}</p>
                <p className="text-sm text-gray-500 mt-2">in the system</p>
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Month to Month Sales */}
            <Card header={<h3 className="font-semibold">Month to Month Sales</h3>}>
              <LineChart
                height={350}
                series={[{ name: 'Sales', data: monthlySeries }]}
                colors={['#3b82f6']}
                options={{
                  xaxis: {
                    categories: monthlyLabels,
                  },
                  yaxis: {
                    labels: {
                      formatter: (value: number) => `$${value.toLocaleString()}`,
                    },
                  },
                }}
              />
            </Card>

            {/* Daily Sales */}
            <Card header={<h3 className="font-semibold">Daily Sales</h3>}>
              <BarChart
                height={350}
                series={[{ name: 'Sales', data: dailySeries }]}
                labels={dailyLabels}
                colors={['#10b981']}
                options={{
                  xaxis: {
                    categories: dailyLabels,
                  },
                  yaxis: {
                    labels: {
                      formatter: (value: number) => `$${value.toLocaleString()}`,
                    },
                  },
                }}
              />
            </Card>

            {/* Credit Pie Chart */}
            <Card header={<h3 className="font-semibold">Credit Earned vs Used</h3>}>
              <PieChart
                height={350}
                series={creditPieData.map(d => d.value)}
                labels={creditPieData.map(d => d.label)}
                colors={['#10b981', '#ef4444']}
              />
            </Card>

            {/* Top 5 Clients */}
            <Card header={<h3 className="font-semibold">Top 5 Clients</h3>}>
              <BarChart
                height={350}
                series={[{ name: 'Sales', data: topClientsData.map(c => c.sales) }]}
                labels={topClientsData.map(c => c.companyName)}
                colors={['#8b5cf6']}
                options={{
                  xaxis: {
                    categories: topClientsData.map(c => c.companyName),
                  },
                  yaxis: {
                    labels: {
                      formatter: (value: number) => `$${value.toLocaleString()}`,
                    },
                  },
                }}
              />
            </Card>

            {/* Top 10 Products */}
            <Card header={<h3 className="font-semibold">Top 10 Products</h3>} className="lg:col-span-2">
              <BarChart
                height={350}
                series={[{ name: 'Sales', data: topProductsData.map(p => p.sales) }]}
                labels={topProductsData.map(p => p.name || p.sku)}
                colors={['#f59e0b']}
                options={{
                  xaxis: {
                    categories: topProductsData.map(p => p.name || p.sku),
                  },
                  yaxis: {
                    labels: {
                      formatter: (value: number) => `$${value.toLocaleString()}`,
                    },
                  },
                }}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
