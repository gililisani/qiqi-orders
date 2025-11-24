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
  // Convert YYYY-MM-DD (API format) to MM/DD/YYYY (display format)
  const formatDateForDisplay = (dateString: string | null): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString + 'T00:00:00'); // Add time to avoid timezone issues
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const year = date.getFullYear();
      return `${month}/${day}/${year}`;
    } catch {
      return dateString;
    }
  };

  // Convert MM/DD/YYYY (display format) to YYYY-MM-DD (API format)
  const parseDateFromDisplay = (displayValue: string): string | null => {
    if (!displayValue) return null;
    // Handle MM/DD/YYYY format
    const parts = displayValue.split('/');
    if (parts.length === 3) {
      const month = parts[0].padStart(2, '0');
      const day = parts[1].padStart(2, '0');
      const year = parts[2];
      if (year.length === 4) {
        return `${year}-${month}-${day}`;
      }
    }
    // If already in YYYY-MM-DD format, return as is
    if (displayValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return displayValue;
    }
    return null;
  };

  const handleDateChange = (key: string, displayValue: string) => {
    const apiValue = parseDateFromDisplay(displayValue);
    onChange(key, apiValue);
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
                  type="text"
                  label={filter.label}
                  value={formatDateForDisplay(values[filter.key])}
                  onChange={(e) => {
                    e.preventDefault();
                    handleDateChange(filter.key, e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                    }
                  }}
                  disabled={loading}
                  placeholder="MM/DD/YYYY"
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
                    type="text"
                    label={`${filter.label} - Start`}
                    value={formatDateForDisplay(values[`${filter.key}_start`])}
                    onChange={(e) => {
                      e.preventDefault();
                      handleDateChange(`${filter.key}_start`, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    disabled={loading}
                    placeholder="MM/DD/YYYY"
                    crossOrigin={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  />
                </div>
                <div>
                  <Input
                    type="text"
                    label={`${filter.label} - End`}
                    value={formatDateForDisplay(values[`${filter.key}_end`])}
                    onChange={(e) => {
                      e.preventDefault();
                      handleDateChange(`${filter.key}_end`, e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                      }
                    }}
                    disabled={loading}
                    placeholder="MM/DD/YYYY"
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

