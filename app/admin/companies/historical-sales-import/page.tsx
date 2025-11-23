'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { supabase } from '../../../../lib/supabaseClient';
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Button,
  Input,
} from '../../../components/MaterialTailwind';
import { ArrowDownTrayIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

interface ParsedRow {
  companyName: string;
  sales: Array<{ date: string; amount: number }>;
  errors: string[];
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export default function HistoricalSalesImportPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [companies, setCompanies] = useState<Map<string, string>>(new Map()); // company_name -> id

  // Fetch all companies for name matching
  const fetchCompanies = async (): Promise<Map<string, string> | null> => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name');

      if (error) throw error;

      const companyMap = new Map<string, string>();
      data?.forEach((company) => {
        // Store normalized company name (lowercase + trimmed) -> id
        const normalizedName = company.company_name.toLowerCase().trim();
        companyMap.set(normalizedName, company.id);
      });
      setCompanies(companyMap);
      return companyMap;
    } catch (error) {
      console.error('Error fetching companies:', error);
      return null;
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResult(null);
      
      // Fetch companies first and get the map directly
      const companyMap = await fetchCompanies();
      
      // Parse Excel file with the company map
      if (companyMap) {
        parseExcelFile(selectedFile, companyMap);
      }
    }
  };

  const parseExcelFile = async (file: File, companyMap: Map<string, string>) => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];

      if (data.length < 2) {
        alert('Excel file must have at least 2 rows (header + data)');
        return;
      }

      // Parse date headers from first row (Column B onward)
      const dateHeaders: string[] = [];
      const firstRow = data[0];
      
      for (let col = 1; col < firstRow.length; col++) {
        const headerValue = firstRow[col];
        if (!headerValue) continue;

        // Try to parse date from header
        let dateStr = '';
        if (typeof headerValue === 'number') {
          // Excel serial date number
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + headerValue * 86400000);
          dateStr = date.toISOString().split('T')[0];
        } else if (typeof headerValue === 'string') {
          // Try parsing MM/DD/YYYY format
          const dateMatch = headerValue.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
          if (dateMatch) {
            const [, month, day, year] = dateMatch;
            const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            dateStr = date.toISOString().split('T')[0];
          } else {
            // Try parsing as date string
            const parsedDate = new Date(headerValue);
            if (!isNaN(parsedDate.getTime())) {
              dateStr = parsedDate.toISOString().split('T')[0];
            }
          }
        }

        if (dateStr) {
          dateHeaders.push(dateStr);
        }
      }

      if (dateHeaders.length === 0) {
        alert('No valid date headers found in columns B onward. Expected format: MM/DD/YYYY');
        return;
      }

      // Parse data rows (starting from row 2)
      const parsedRows: ParsedRow[] = [];
      
      for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        if (!row || row.length === 0) continue;

        const companyName = String(row[0] || '').trim();
        if (!companyName) continue;

        const errors: string[] = [];
        const sales: Array<{ date: string; amount: number }> = [];

        // Check if company exists - normalize the name (lowercase + trim) for lookup
        const normalizedCompanyName = companyName.toLowerCase().trim();
        const companyId = companyMap.get(normalizedCompanyName);
        if (!companyId) {
          errors.push(`Company "${companyName}" not found in system`);
        }

        // Parse sales amounts for each date column
        for (let colIndex = 0; colIndex < dateHeaders.length; colIndex++) {
          const cellValue = row[colIndex + 1]; // +1 because Column A is company name
          if (!cellValue) continue;

          // Parse amount (handle $, commas, etc.)
          let amount = 0;
          if (typeof cellValue === 'number') {
            amount = cellValue;
          } else if (typeof cellValue === 'string') {
            // Remove $, commas, spaces
            const cleaned = cellValue.replace(/[$,\s]/g, '');
            const parsed = parseFloat(cleaned);
            if (!isNaN(parsed)) {
              amount = parsed;
            } else {
              errors.push(`Invalid amount "${cellValue}" for ${companyName} on ${dateHeaders[colIndex]}`);
              continue;
            }
          }

          // Allow both positive (sales) and negative (credits/refunds) amounts
          if (amount !== 0) {
            sales.push({
              date: dateHeaders[colIndex],
              amount: amount,
            });
          }
        }

        parsedRows.push({
          companyName,
          sales,
          errors,
        });
      }

      setParsedData(parsedRows);
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      alert('Error parsing Excel file. Please check the format.');
    }
  };

  const handleImport = async () => {
    if (parsedData.length === 0) {
      alert('No data to import');
      return;
    }

    setImporting(true);
    setResult(null);

    const errors: string[] = [];
    let successCount = 0;
    let failedCount = 0;

    try {
      // Get current admin user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Batch insert in chunks of 100
      const batchSize = 100;
      const allRecords: Array<{
        company_id: string;
        sale_date: string;
        amount: number;
        created_by: string | null;
      }> = [];

      // Re-fetch companies to ensure we have the latest data
      const companyMap = await fetchCompanies();
      if (!companyMap) {
        throw new Error('Failed to fetch companies');
      }

      for (const row of parsedData) {
        // Normalize company name for lookup (lowercase + trim)
        const normalizedCompanyName = row.companyName.toLowerCase().trim();
        const companyId = companyMap.get(normalizedCompanyName);
        if (!companyId) {
          failedCount++;
          errors.push(`Company "${row.companyName}" not found`);
          continue;
        }

        if (row.errors.length > 0) {
          failedCount++;
          errors.push(...row.errors.map(e => `${row.companyName}: ${e}`));
          continue;
        }

        for (const sale of row.sales) {
          allRecords.push({
            company_id: companyId,
            sale_date: sale.date,
            amount: sale.amount,
            created_by: session.user.id,
          });
        }
      }

      // Insert in batches
      for (let i = 0; i < allRecords.length; i += batchSize) {
        const batch = allRecords.slice(i, i + batchSize);
        
        // Use upsert - Supabase will handle conflicts based on the unique constraint (company_id, sale_date)
        // The unique index idx_historical_sales_unique will be used automatically
        // If a record with the same company_id and sale_date exists, it will be updated
        const { error: upsertError } = await supabase
          .from('historical_sales')
          .upsert(batch, {
            onConflict: 'company_id,sale_date',
          });

        if (upsertError) {
          console.error('Batch upsert error:', upsertError);
          failedCount += batch.length;
          errors.push(`Batch ${i / batchSize + 1} failed: ${upsertError.message}`);
        } else {
          successCount += batch.length;
        }
      }

      // Recalculate target periods for all affected companies
      const affectedCompanyIds = Array.from(new Set(allRecords.map(r => r.company_id)));
      for (const companyId of affectedCompanyIds) {
        try {
          const response = await fetch('/api/target-periods/recalculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId }),
          });
          if (!response.ok) {
            console.error(`Failed to recalculate for company ${companyId}`);
          }
        } catch (error) {
          console.error(`Error recalculating for company ${companyId}:`, error);
        }
      }

      setResult({
        success: successCount,
        failed: failedCount,
        errors: errors.slice(0, 50), // Limit to first 50 errors
      });
    } catch (error: any) {
      console.error('Import error:', error);
      setResult({
        success: successCount,
        failed: failedCount + parsedData.length,
        errors: [error.message || 'Import failed'],
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="mt-8 mb-4 space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">Import Historical Sales</h2>

      <Card
        placeholder={undefined}
        onPointerEnterCapture={undefined}
        onPointerLeaveCapture={undefined}
      >
        <CardHeader
          floated={false}
          shadow={false}
          className="rounded-none"
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          <Typography
            variant="h6"
            color="blue-gray"
            placeholder={undefined}
            onPointerEnterCapture={undefined}
            onPointerLeaveCapture={undefined}
          >
            Upload Excel File
          </Typography>
        </CardHeader>
        <CardBody
          placeholder={undefined}
          onPointerEnterCapture={undefined}
          onPointerLeaveCapture={undefined}
        >
          <div className="space-y-4">
            <div>
              <Typography
                variant="small"
                color="blue-gray"
                className="mb-2"
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
              >
                Excel Format:
              </Typography>
              <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                <li>Column A: Company names (must match existing companies)</li>
                <li>Column B onward: Date headers (MM/DD/YYYY format, e.g., 01/01/2023 for January 2023)</li>
                <li>Cell values: Dollar amounts (e.g., $30,000.00 or 30000). Use negative amounts for credits/refunds (e.g., -5000)</li>
              </ul>
            </div>

            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="max-w-md"
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
                crossOrigin={undefined}
              />
            </div>

            {parsedData.length > 0 && (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <Typography
                    variant="h6"
                    color="blue-gray"
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    Preview ({parsedData.length} companies)
                  </Typography>
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex items-center gap-2"
                    placeholder={undefined}
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                  >
                    <ArrowUpTrayIcon className="h-5 w-5" />
                    {importing ? 'Importing...' : 'Import Data'}
                  </Button>
                </div>

                <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 rounded">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Company
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Sales Entries
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {parsedData.map((row, index) => (
                        <tr key={index} className={row.errors.length > 0 ? 'bg-red-50' : ''}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {row.companyName}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {row.sales.length} entries
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {row.errors.length > 0 ? (
                              <span className="text-red-600">
                                {row.errors.length} error(s)
                              </span>
                            ) : (
                              <span className="text-green-600">Ready</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {parsedData.some(row => row.errors.length > 0) && (
                  <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded">
                    <Typography
                      variant="small"
                      color="red"
                      className="font-semibold mb-2"
                      placeholder={undefined}
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                    >
                      Errors Found:
                    </Typography>
                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                      {parsedData.flatMap((row, idx) =>
                        row.errors.map((error, errIdx) => (
                          <li key={`${idx}-${errIdx}`}>{row.companyName}: {error}</li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {result && (
              <div className={`mt-4 p-4 rounded ${
                result.failed > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
              }`}>
                <Typography
                  variant="small"
                  className={`font-semibold mb-2 ${
                    result.failed > 0 ? 'text-yellow-800' : 'text-green-800'
                  }`}
                  placeholder={undefined}
                  onPointerEnterCapture={undefined}
                  onPointerLeaveCapture={undefined}
                >
                  Import Results:
                </Typography>
                <ul className="text-sm space-y-1">
                  <li className={result.failed > 0 ? 'text-yellow-700' : 'text-green-700'}>
                    Success: {result.success} records
                  </li>
                  {result.failed > 0 && (
                    <li className="text-yellow-700">
                      Failed: {result.failed} records
                    </li>
                  )}
                </ul>
                {result.errors.length > 0 && (
                  <div className="mt-2">
                    <Typography
                      variant="small"
                      className="font-semibold text-red-800"
                      placeholder={undefined}
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                    >
                      Errors:
                    </Typography>
                    <ul className="list-disc list-inside text-sm text-red-700 mt-1 space-y-1 max-h-32 overflow-y-auto">
                      {result.errors.map((error, idx) => (
                        <li key={idx}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

