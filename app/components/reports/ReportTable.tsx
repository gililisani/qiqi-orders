'use client';

import React from 'react';
import Card from '../ui/Card';

export interface ColumnDef {
  key: string;
  label: string;
  format?: (value: any, row?: any) => string | React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface ReportTableProps {
  columns: ColumnDef[];
  data: any[];
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
}

export function ReportTable({
  columns,
  data,
  loading = false,
  error = null,
  emptyMessage = 'No data available',
}: ReportTableProps) {
  if (loading) {
    return (
      <Card>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading data...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-red-600">{error}</p>
        </div>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-gray-600">{emptyMessage}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="min-w-full border border-[#e5e5e5] rounded-lg">
          <thead>
            <tr className="border-b border-[#e5e5e5] bg-gray-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider ${column.className || ''}`}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-[#e5e5e5] hover:bg-gray-50"
              >
                {columns.map((column) => {
                  const value = row[column.key];
                  const displayValue = column.format
                    ? column.format(value, row)
                    : value ?? '';

                  return (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-sm text-gray-900 ${column.className || ''}`}
                    >
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default ReportTable;

