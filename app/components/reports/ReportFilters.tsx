'use client';

import React from 'react';
import { Select, Option } from '../../components/MaterialTailwind';
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
  onSubmit?: () => void;
  onReset?: () => void;
  showButtons?: boolean;
}

export function ReportFilters({ filters, values, onChange, loading, onSubmit, onReset, showButtons = false }: ReportFiltersProps) {
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <Select
                  label={filter.label}
                  value={values[filter.key] || ''}
                  onChange={(val) => handleSelectChange(filter.key, val)}
                  disabled={loading}
                  placeholder={filter.placeholder}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  {filter.options?.map((option) => (
                    <Option key={option.value} value={option.value}>
                      {option.label}
                    </Option>
                  ))}
                </Select>
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
      {showButtons && (onSubmit || onReset) && (
        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-200">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          )}
          {onSubmit && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              Submit
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

export default ReportFilters;

