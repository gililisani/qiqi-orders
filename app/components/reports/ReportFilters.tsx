'use client';

import React from 'react';
import { Input, Select, Option } from '../../components/MaterialTailwind';
import Card from '../ui/Card';
import { MultiSelect } from './MultiSelect';

export interface FilterConfig {
  type: 'date' | 'dateRange' | 'select' | 'multiSelect';
  key: string;
  label: string;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
}

interface ReportFiltersProps {
  filters: FilterConfig[];
  values: Record<string, any>;
  onChange: (key: string, value: any) => void;
  loading?: boolean;
}

export function ReportFilters({ filters, values, onChange, loading }: ReportFiltersProps) {
  const handleDateChange = (key: string, value: string) => {
    onChange(key, value || null);
  };

  const handleSelectChange = (key: string, value: string | undefined) => {
    onChange(key, value || null);
  };

  const handleMultiSelectChange = (key: string, selectedValues: string[]) => {
    onChange(key, selectedValues.length > 0 ? selectedValues : null);
  };

  return (
    <Card header={<h3 className="font-semibold">Filters</h3>}>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filters.map((filter) => {
          if (filter.type === 'date') {
            return (
              <div key={filter.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {filter.label}
                </label>
                <input
                  type="date"
                  value={values[filter.key] || ''}
                  onChange={(e) => handleDateChange(filter.key, e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            );
          }

          if (filter.type === 'dateRange') {
            return (
              <React.Fragment key={filter.key}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {filter.label} - Start
                  </label>
                  <input
                    type="date"
                    value={values[`${filter.key}_start`] || ''}
                    onChange={(e) => handleDateChange(`${filter.key}_start`, e.target.value)}
                    disabled={loading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {filter.label} - End
                  </label>
                  <input
                    type="date"
                    value={values[`${filter.key}_end`] || ''}
                    onChange={(e) => handleDateChange(`${filter.key}_end`, e.target.value)}
                    disabled={loading}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:cursor-not-allowed"
                  />
                </div>
              </React.Fragment>
            );
          }

          if (filter.type === 'select') {
            return (
              <div key={filter.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {filter.label}
                </label>
                <select
                  value={values[filter.key] || ''}
                  onChange={(e) => handleSelectChange(filter.key, e.target.value)}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">{filter.placeholder || 'Select...'}</option>
                  {filter.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (filter.type === 'multiSelect') {
            return (
              <div key={filter.key}>
                <MultiSelect
                  label={filter.label}
                  options={filter.options || []}
                  value={Array.isArray(values[filter.key]) ? values[filter.key] : null}
                  onChange={(selectedValues) => handleMultiSelectChange(filter.key, selectedValues)}
                  placeholder={filter.placeholder}
                  disabled={loading}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </Card>
  );
}

export default ReportFilters;

