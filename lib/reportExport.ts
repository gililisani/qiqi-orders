/**
 * Report Export Utility
 * 
 * Generic export functions for reports (Excel and CSV)
 */

import * as XLSX from 'xlsx';

export interface ColumnDef {
  key: string;
  label: string;
  format?: (value: any) => string;
}

/**
 * Export data to Excel (.xlsx)
 */
export function exportToExcel(
  data: any[],
  columns: ColumnDef[],
  filename: string
): void {
  try {
    // Transform data to match column definitions
    const rows = data.map((row) => {
      const transformedRow: any = {};
      columns.forEach((col) => {
        const value = row[col.key];
        transformedRow[col.label] = col.format ? col.format(value) : value ?? '';
      });
      return transformedRow;
    });

    // Create worksheet from rows
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const maxWidth = columns.reduce((acc, col) => {
      const maxLength = Math.max(
        col.label.length,
        ...rows.map((row) => String(row[col.label] || '').length)
      );
      return Math.max(acc, maxLength);
    }, 10);
    
    worksheet['!cols'] = columns.map(() => ({ wch: Math.min(maxWidth, 50) }));

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');

    // Generate XLSX file as array buffer
    const xlsxBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'array',
      compression: true,
    });

    // Download file
    const blob = new Blob([xlsxBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    link.click();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    throw error;
  }
}

/**
 * Export data to CSV
 */
export function exportToCSV(
  data: any[],
  columns: ColumnDef[],
  filename: string
): void {
  try {
    // Create header row
    const headers = columns.map((col) => col.label);
    const headerRow = headers.join(',');

    // Create data rows
    const rows = data.map((row) => {
      return columns
        .map((col) => {
          const value = row[col.key];
          const formattedValue = col.format ? col.format(value) : value ?? '';
          // Escape commas and quotes in CSV
          const stringValue = String(formattedValue);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        })
        .join(',');
    });

    // Combine header and rows
    const csvContent = [headerRow, ...rows].join('\n');

    // Download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');

    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    throw error;
  }
}

/**
 * Generate filename with date range suffix
 */
export function generateFilename(
  baseName: string,
  startDate?: string,
  endDate?: string
): string {
  const dateStr = startDate && endDate
    ? `_${startDate}_to_${endDate}`
    : startDate
    ? `_from_${startDate}`
    : '';
  return `${baseName}${dateStr}`;
}

