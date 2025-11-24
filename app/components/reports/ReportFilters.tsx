'use client';

import React, { useState, useEffect } from 'react';
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
}

export function ReportFilters({ filters, values, onChange, loading }: ReportFiltersProps) {
  // Local state for date inputs to prevent triggering fetchData on every keystroke
  const [localDateValues, setLocalDateValues] = useState<Record<string, string>>({});

  // Sync local state when values prop changes (from external updates)
  useEffect(() => {
    const newLocalValues: Record<string, string> = {};
    filters.forEach((filter) => {
      if (filter.type === 'date' && values[filter.key]) {
        newLocalValues[filter.key] = values[filter.key];
      } else if (filter.type === 'dateRange') {
        if (values[`${filter.key}_start`]) {
          newLocalValues[`${filter.key}_start`] = values[`${filter.key}_start`];
        }
        if (values[`${filter.key}_end`]) {
          newLocalValues[`${filter.key}_end`] = values[`${filter.key}_end`];
        }
      }
    });
    setLocalDateValues((prev) => ({ ...prev, ...newLocalValues }));
  }, [values, filters]);

  // Handle date input change - only update local state (no fetchData trigger)
  const handleDateChange = (key: string, value: string) => {
    setLocalDateValues((prev) => ({ ...prev, [key]: value }));
  };

  // Handle date input blur - sync to parent filters (triggers fetchData)
  const handleDateBlur = (key: string) => {
    const localValue = localDateValues[key] || '';
    onChange(key, localValue || null);
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
            const localValue = localDateValues[filter.key] ?? values[filter.key] ?? '';
            return (
              <div key={filter.key}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {filter.label}
                </label>
                <input
                  type="date"
                  value={localValue}
                  onChange={(e) => {
                    handleDateChange(filter.key, e.target.value);
                  }}
                  onBlur={() => {
                    handleDateBlur(filter.key);
                  }}
                  disabled={loading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black disabled:bg-gray-100 disabled:cursor-not-allowed"
                />
              </div>
            );
          }

          if (filter.type === 'dateRange') {
            const startKey = `${filter.key}_start`;
            const endKey = `${filter.key}_end`;
            const localStartValue = localDateValues[startKey] ?? values[startKey] ?? '';
            const localEndValue = localDateValues[endKey] ?? values[endKey] ?? '';
            return (
              <React.Fragment key={filter.key}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {filter.label} - Start
                  </label>
                  <input
                    type="date"
                    value={localStartValue}
                    onChange={(e) => {
                      handleDateChange(startKey, e.target.value);
                    }}
                    onBlur={() => {
                      handleDateBlur(startKey);
                    }}
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
                    value={localEndValue}
                    onChange={(e) => {
                      handleDateChange(endKey, e.target.value);
                    }}
                    onBlur={() => {
                      handleDateBlur(endKey);
                    }}
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
    </Card>
  );
}

export default ReportFilters;

