'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../../../../lib/supabaseClient';
import { ReportFilters, FilterConfig } from '../../../components/reports/ReportFilters';
import { ReportTable, ColumnDef } from '../../../components/reports/ReportTable';
import { ExportButton } from '../../../components/reports/ExportButton';
import { ColumnDef as ExportColumnDef } from '../../../../lib/reportExport';
import Card from '../../../components/ui/Card';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface CompanyGoalsData {
  id: string;
  company_id: string;
  company_name: string;
  netsuite_number: string;
  period_name: string;
  start_date: string;
  end_date: string;
  target_amount: number;
  current_progress: number;
  progress_percentage: number;
  is_ended: boolean;
  days_remaining: number;
  has_started: boolean;
}

export default function CompanyGoalsReportPage() {
  const [data, setData] = useState<CompanyGoalsData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Array<{ value: string; label: string }>>([]);
  const [targetPeriods, setTargetPeriods] = useState<Array<{ value: string; label: string }>>([]);
  const [filters, setFilters] = useState({
    companyIds: null as string[] | null,
    targetPeriodId: null as string | null,
    dateRange_start: null as string | null,
    dateRange_end: null as string | null,
  });

  // Fetch companies and target periods for filters
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

        // Fetch target periods
        const { data: periodsData } = await supabase
          .from('target_periods')
          .select('id, period_name, start_date, end_date')
          .order('start_date');

        if (periodsData) {
          setTargetPeriods(
            periodsData.map((p) => ({
              value: p.id,
              label: `${p.period_name} (${p.start_date} - ${p.end_date})`,
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
      if (filters.companyIds && filters.companyIds.length > 0) {
        params.append('companyIds', filters.companyIds.join(','));
      }
      if (filters.targetPeriodId) {
        params.append('targetPeriodId', filters.targetPeriodId);
      }
      if (filters.dateRange_start) {
        params.append('startDate', filters.dateRange_start);
      }
      if (filters.dateRange_end) {
        params.append('endDate', filters.dateRange_end);
      }

      const response = await fetch(`/api/reports/company-goals?${params.toString()}`);
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
      month: 'long',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const filterConfigs: FilterConfig[] = [
    {
      type: 'multiSelect',
      key: 'companyIds',
      label: 'Company',
      options: companies,
      placeholder: 'Select companies',
    },
    {
      type: 'select',
      key: 'targetPeriodId',
      label: 'Target Period',
      options: targetPeriods,
      placeholder: 'Select target period',
    },
    {
      type: 'dateRange',
      key: 'dateRange',
      label: 'Date Range',
      placeholder: 'Select date range',
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
      key: 'period_name',
      label: 'Period',
    },
    {
      key: 'start_date',
      label: 'Start Date',
      format: (value) => formatDate(value),
    },
    {
      key: 'end_date',
      label: 'End Date',
      format: (value) => formatDate(value),
    },
    {
      key: 'target_amount',
      label: 'Target Amount',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'current_progress',
      label: 'Current Progress',
      format: (value) => formatCurrency(value),
    },
    {
      key: 'progress_percentage',
      label: 'Progress',
      format: (value, row: CompanyGoalsData) => {
        const percentage = Math.max(value, 0); // Allow values above 100%
        
        return (
          <div className="space-y-1">
            <div className="text-sm font-medium text-gray-900 text-center">
              {percentage.toFixed(1)}%
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(percentage, 100)}%` }}
              ></div>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      format: (_, row: CompanyGoalsData) => {
        if (row.is_ended) {
          return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">Ended</span>;
        }
        if (row.has_started) {
          return (
            <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-700 rounded">
              {row.days_remaining} {row.days_remaining === 1 ? 'day' : 'days'} to complete
            </span>
          );
        }
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">Not Started</span>;
      },
    },
  ];

  const exportColumns: ExportColumnDef[] = [
    { key: 'company_name', label: 'Company Name' },
    { key: 'netsuite_number', label: 'NetSuite Number' },
    { key: 'period_name', label: 'Period Name' },
    { key: 'start_date', label: 'Start Date', format: (value) => formatDate(value) },
    { key: 'end_date', label: 'End Date', format: (value) => formatDate(value) },
    { key: 'target_amount', label: 'Target Amount', format: (value) => formatCurrency(value) },
    { key: 'current_progress', label: 'Current Progress', format: (value) => formatCurrency(value) },
    { key: 'progress_percentage', label: 'Progress %', format: (value) => `${value}%` },
    {
      key: 'status',
      label: 'Status',
      format: (_, row: CompanyGoalsData) => {
        if (row.is_ended) return 'Ended';
        if (row.has_started) return `${row.days_remaining} days to complete`;
        return 'Not Started';
      },
    },
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
            <h1 className="text-2xl font-semibold text-gray-900">
              Company Annual Goals Progress Report
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              View all companies with their target periods, progress, and completion status
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="company-goals-report"
            format="xlsx"
            startDate={filters.dateRange_start || undefined}
            endDate={filters.dateRange_end || undefined}
            disabled={loading || data.length === 0}
          />
          <ExportButton
            data={data}
            columns={exportColumns}
            filename="company-goals-report"
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
        emptyMessage="No target periods found matching the selected filters"
      />
    </div>
  );
}

