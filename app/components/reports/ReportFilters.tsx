'use client';

import React from 'react';
import { Input, Select, Option } from '../../components/MaterialTailwind';
import Card from '../ui/Card';

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
                <Input
                  type="date"
                  label={filter.label}
                  value={values[filter.key] || ''}
                  onChange={(e) => handleDateChange(filter.key, e.target.value)}
                  disabled={loading}
                  placeholder={filter.placeholder}
                  crossOrigin={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                />
              </div>
            );
          }

          if (filter.type === 'dateRange') {
            return (
              <React.Fragment key={filter.key}>
                <div>
                  <Input
                    type="date"
                    label={`${filter.label} - Start`}
                    value={values[`${filter.key}_start`] || ''}
                    onChange={(e) => handleDateChange(`${filter.key}_start`, e.target.value)}
                    disabled={loading}
                    placeholder={filter.placeholder}
                    crossOrigin={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  />
                </div>
                <div>
                  <Input
                    type="date"
                    label={`${filter.label} - End`}
                    value={values[`${filter.key}_end`] || ''}
                    onChange={(e) => handleDateChange(`${filter.key}_end`, e.target.value)}
                    disabled={loading}
                    placeholder={filter.placeholder}
                    crossOrigin={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
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
            // For multi-select, we'll use a simple select that allows multiple values
            // In a real implementation, you might want a better multi-select component
            return (
              <div key={filter.key}>
                <Select
                  label={filter.label}
                  value={Array.isArray(values[filter.key]) ? values[filter.key].join(',') : ''}
                  onChange={(val) => {
                    // Simple implementation - in production, use a proper multi-select
                    const selected = val ? [val] : [];
                    handleMultiSelectChange(filter.key, selected);
                  }}
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

          return null;
        })}
      </div>
    </Card>
  );
}

export default ReportFilters;

