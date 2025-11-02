'use client';

import { useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';


import InnerPageShell from '../../../components/ui/InnerPageShell';
import Link from 'next/link';

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: string[];
}

export default function ImportCompaniesPage() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const downloadTemplate = () => {
    const headers = [
      'company_name',
      'netsuite_number',
      'support_fund_percent',
      'subsidiary_name',
      'class_name',
      'location_name',
      'incoterm_name',
      'payment_terms_name',
      'company_address',
      'company_email',
      'company_phone',
      'company_tax_number',
      'ship_to',
      'ship_to_contact_name',
      'ship_to_contact_email',
      'ship_to_contact_phone',
      'ship_to_street_line_1',
      'ship_to_street_line_2',
      'ship_to_city',
      'ship_to_state',
      'ship_to_postal_code',
      'ship_to_country'
    ];

    const csvContent = headers.join(',') + '\n' + 
      'Example Company,NS12345,10,US Subsidiary,Distribution,Main Warehouse,FOB,Net 30,"123 Main St, City, State 12345",contact@example.com,555-1234,TAX123,"456 Ship St, City, State 54321",John Doe,shipping@example.com,555-5678,456 Ship St,,City,State,54321,USA';

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'company_import_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n');
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      
      const values: string[] = [];
      let current = '';
      let inQuotes = false;

      for (let char of lines[i]) {
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ''));

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      data.push(row);
    }

    return data;
  };

  const handleImport = async () => {
    if (!file) return;

    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      let success = 0;
      let failed = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        try {
          // Skip if no company name or netsuite number
          if (!row.company_name || !row.netsuite_number) {
            skipped++;
            continue;
          }

          // Check for duplicate by NetSuite number
          const { data: existing } = await supabase
            .from('companies')
            .select('id, company_name')
            .eq('netsuite_number', row.netsuite_number)
            .single();

          if (existing) {
            skipped++;
            errors.push(`NetSuite #${row.netsuite_number}: Already exists (${existing.company_name})`);
            continue;
          }

          // Lookup foreign key IDs
          let support_fund_id = null;
          if (row.support_fund_percent) {
            const { data: sf } = await supabase
              .from('support_fund_levels')
              .select('id')
              .eq('percent', parseFloat(row.support_fund_percent))
              .single();
            support_fund_id = sf?.id || null;
          }

          let subsidiary_id = null;
          if (row.subsidiary_name) {
            const { data: sub } = await supabase
              .from('subsidiaries')
              .select('id')
              .ilike('name', row.subsidiary_name)
              .single();
            subsidiary_id = sub?.id || null;
          }

          let class_id = null;
          if (row.class_name) {
            const { data: cls } = await supabase
              .from('classes')
              .select('id')
              .ilike('name', row.class_name)
              .single();
            class_id = cls?.id || null;
          }

          let location_id = null;
          if (row.location_name) {
            const { data: loc } = await supabase
              .from('Locations')
              .select('id')
              .ilike('location_name', row.location_name)
              .single();
            location_id = loc?.id || null;
          }

          let incoterm_id = null;
          if (row.incoterm_name) {
            const { data: inc } = await supabase
              .from('incoterms')
              .select('id')
              .ilike('name', row.incoterm_name)
              .single();
            incoterm_id = inc?.id || null;
          }

          let payment_terms_id = null;
          if (row.payment_terms_name) {
            const { data: pt } = await supabase
              .from('payment_terms')
              .select('id')
              .ilike('name', row.payment_terms_name)
              .single();
            payment_terms_id = pt?.id || null;
          }

          // Insert company
          const { error: insertError } = await supabase
            .from('companies')
            .insert({
              company_name: row.company_name,
              netsuite_number: row.netsuite_number,
              support_fund_id,
              subsidiary_id,
              class_id,
              location_id,
              incoterm_id,
              payment_terms_id,
              company_address: row.company_address || null,
              company_email: row.company_email || null,
              company_phone: row.company_phone || null,
              company_tax_number: row.company_tax_number || null,
              ship_to: row.ship_to || null,
              ship_to_contact_name: row.ship_to_contact_name || null,
              ship_to_contact_email: row.ship_to_contact_email || null,
              ship_to_contact_phone: row.ship_to_contact_phone || null,
              ship_to_street_line_1: row.ship_to_street_line_1 || null,
              ship_to_street_line_2: row.ship_to_street_line_2 || null,
              ship_to_city: row.ship_to_city || null,
              ship_to_state: row.ship_to_state || null,
              ship_to_postal_code: row.ship_to_postal_code || null,
              ship_to_country: row.ship_to_country || null
            });

          if (insertError) throw insertError;

          success++;
        } catch (err: any) {
          failed++;
          errors.push(`Row ${rows.indexOf(row) + 2}: ${err.message}`);
        }
      }

      setResult({ success, failed, skipped, errors });
    } catch (err: any) {
      alert('Error reading file: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <InnerPageShell title="Import Companies">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Import Companies</h1>
              <p className="text-gray-600 mt-1">Bulk import companies from CSV file</p>
            </div>
            <Link
              href="/admin/companies"
              className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Back to Companies
            </Link>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="font-semibold text-blue-900 mb-2">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
              <li>Download the CSV template below</li>
              <li>Fill in your company data (required: company_name, netsuite_number)</li>
              <li>For dropdowns (subsidiary, class, location, etc.), use the exact name from the system</li>
              <li>Upload the completed CSV file</li>
              <li>Duplicates (by NetSuite number) will be automatically skipped</li>
            </ol>
          </div>

          {/* Download Template */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Download Template</h3>
            <button
              onClick={downloadTemplate}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Download CSV Template
            </button>
          </div>

          {/* Upload File */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Upload CSV</h3>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100"
            />
            {file && (
              <div className="mt-4">
                <p className="text-sm text-gray-600 mb-2">Selected: {file.name}</p>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50"
                >
                  {importing ? 'Importing...' : 'Import Companies'}
                </button>
              </div>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Import Results</h3>
              <div className="space-y-2">
                <p className="text-green-600 font-medium">✓ Successfully imported: {result.success}</p>
                <p className="text-yellow-600 font-medium">⊘ Skipped (duplicates): {result.skipped}</p>
                <p className="text-red-600 font-medium">✗ Failed: {result.failed}</p>
              </div>
              {result.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Errors/Warnings:</h4>
                  <div className="bg-gray-50 rounded-lg p-3 max-h-60 overflow-y-auto">
                    {result.errors.map((error, idx) => (
                      <p key={idx} className="text-sm text-gray-700">{error}</p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </InnerPageShell>
    </>
  );
}

