'use client';

import React from 'react';
import { Button } from '../MaterialTailwind';
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { exportToExcel, exportToCSV, ColumnDef as ExportColumnDef, generateFilename } from '../../../lib/reportExport';

interface ExportButtonProps {
  data: any[];
  columns: ExportColumnDef[];
  filename: string;
  format?: 'xlsx' | 'csv';
  startDate?: string;
  endDate?: string;
  disabled?: boolean;
}

export function ExportButton({
  data,
  columns,
  filename,
  format = 'xlsx',
  startDate,
  endDate,
  disabled = false,
}: ExportButtonProps) {
  const handleExport = () => {
    try {
      const exportFilename = generateFilename(filename, startDate, endDate);
      
      if (format === 'xlsx') {
        exportToExcel(data, columns, exportFilename);
      } else {
        exportToCSV(data, columns, exportFilename);
      }
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export. Please try again.');
    }
  };

  return (
    <Button
      onClick={handleExport}
      disabled={disabled || data.length === 0}
      className="flex items-center gap-2"
      placeholder={undefined}
      onPointerEnterCapture={undefined}
      onPointerLeaveCapture={undefined}
    >
      <ArrowDownTrayIcon className="h-5 w-5" />
      Export {format.toUpperCase()}
    </Button>
  );
}

export default ExportButton;

