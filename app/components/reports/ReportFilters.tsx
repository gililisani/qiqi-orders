'use client';

import React, { useState, useEffect } from 'react';
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
  // Local state for date inputs to prevent triggering fetchData on every keystroke
  const [localDateValues, setLocalDateValues] = useState<Record<string, string>>({});

  // Sync local state when values prop changes (from external updates)
  useEffect(() => {
    const newLocalValues: Record<string, string> = {};
    filters.forEach((filter) => {
      if (filter.type === 'date' && values[filter.key]) {
        newLocalValues[filter.key] = formatDateForDisplay(values[filter.key]);
      } else if (filter.type === 'dateRange') {
        if (values[`${filter.key}_start`]) {
          newLocalValues[`${filter.key}_start`] = formatDateForDisplay(values[`${filter.key}_start`]);
        }
        if (values[`${filter.key}_end`]) {
          newLocalValues[`${filter.key}_end`] = formatDateForDisplay(values[`${filter.key}_end`]);
        }
      }
    });
    setLocalDateValues((prev) => ({ ...prev, ...newLocalValues }));
  }, [values, filters]);

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
    if (!displayValue || displayValue.trim() === '') return null;
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

  // Handle date input change - only update local state (no fetchData trigger)
  const handleDateInputChange = (key: string, value: string) => {
    setLocalDateValues((prev) => ({ ...prev, [key]: value }));
  };

  // Handle date input blur - sync to parent filters (triggers fetchData)
  const handleDateBlur = (key: string) => {
    const displayValue = localDateValues[key] || '';
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
            const localValue = localDateValues[filter.key] ?? formatDateForDisplay(values[filter.key]);
            return (
              <div key={filter.key}>
                <Input
                  type="text"
                  label={filter.label}
                  value={localValue}
                  onChange={(e) => {
                    handleDateInputChange(filter.key, e.target.value);
                  }}
                  onBlur={() => {
                    handleDateBlur(filter.key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      (e.target as HTMLInputElement).blur(); // Trigger blur to sync
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
            const startKey = `${filter.key}_start`;
            const endKey = `${filter.key}_end`;
            const localStartValue = localDateValues[startKey] ?? formatDateForDisplay(values[startKey]);
            const localEndValue = localDateValues[endKey] ?? formatDateForDisplay(values[endKey]);
            return (
              <React.Fragment key={filter.key}>
                <div>
                  <Input
                    type="text"
                    label={`${filter.label} - Start`}
                    value={localStartValue}
                    onChange={(e) => {
                      handleDateInputChange(startKey, e.target.value);
                    }}
                    onBlur={() => {
                      handleDateBlur(startKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLInputElement).blur(); // Trigger blur to sync
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
                    value={localEndValue}
                    onChange={(e) => {
                      handleDateInputChange(endKey, e.target.value);
                    }}
                    onBlur={() => {
                      handleDateBlur(endKey);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLInputElement).blur(); // Trigger blur to sync
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

