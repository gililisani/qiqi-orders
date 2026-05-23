'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Download, Upload } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { formatCurrency } from '../../../../lib/formatters';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { Badge } from '../../../components/qq/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../components/qq/table';
import { useToast } from '../../../components/ui/ToastProvider';

interface ProductData {
  item_name: string;
  netsuite_name: string;
  sku: string;
  upc: string;
  size: string;
  case_pack: number;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  picture_url?: string;
}

const REQUIRED_HEADERS = [
  'item_name',
  'netsuite_name',
  'sku',
  'upc',
  'size',
  'case_pack',
  'price_international',
  'price_americas',
  'enable',
  'list_in_support_funds',
  'visible_to_americas',
  'visible_to_international',
] as const;

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export default function BulkUploadProducts() {
  const router = useRouter();
  const toast = useToast();

  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    setSuccess(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
      setError('Please select a valid CSV file.');
      return;
    }
    setFileName(file.name);
    parseCSV(file);
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter((l) => l.trim());
      if (lines.length < 2) {
        setError('CSV file must have a header row and at least one data row.');
        return;
      }
      const headers = parseCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
      const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
      if (missing.length > 0) {
        setError(`Missing required headers: ${missing.join(', ')}`);
        return;
      }

      const parsed: ProductData[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length !== headers.length) {
          setError(
            `Row ${i + 1} has ${values.length} columns; expected ${headers.length}. Check for extra commas or missing fields.`
          );
          return;
        }
        parsed.push({
          item_name: values[headers.indexOf('item_name')] || '',
          netsuite_name: values[headers.indexOf('netsuite_name')] || '',
          sku: values[headers.indexOf('sku')] || '',
          upc: values[headers.indexOf('upc')] || '',
          size: values[headers.indexOf('size')] || '',
          case_pack: parseInt(values[headers.indexOf('case_pack')]) || 0,
          price_international: parseFloat(values[headers.indexOf('price_international')]) || 0,
          price_americas: parseFloat(values[headers.indexOf('price_americas')]) || 0,
          enable: values[headers.indexOf('enable')].toLowerCase() === 'true',
          list_in_support_funds:
            values[headers.indexOf('list_in_support_funds')].toLowerCase() === 'true',
          visible_to_americas:
            values[headers.indexOf('visible_to_americas')].toLowerCase() === 'true',
          visible_to_international:
            values[headers.indexOf('visible_to_international')].toLowerCase() === 'true',
          picture_url: values[headers.indexOf('picture_url')] || undefined,
        });
      }
      setProducts(parsed);
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (products.length === 0) {
      setError('No products to upload.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const { error } = await supabase.from('Products').insert(products);
      if (error) throw error;
      const count = products.length;
      setSuccess(`Successfully uploaded ${count} product${count === 1 ? '' : 's'}.`);
      toast.success(`${count} product${count === 1 ? '' : 's'} uploaded.`);
      setProducts([]);
      setFileName('');
      const input = document.getElementById('csv-file') as HTMLInputElement | null;
      if (input) input.value = '';
    } catch (err: any) {
      setError(err.message || 'Failed to upload products.');
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [...REQUIRED_HEADERS, 'picture_url'];
    const sample = [
      'Sample Product',
      'Sample NetSuite Name',
      'SAMPLE001',
      '123456789012',
      '250ml',
      '12',
      '25.50',
      '30.00',
      'true',
      'true',
      'true',
      'true',
      'https://example.com/image.jpg',
    ];
    const csv = [headers, sample].map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/products"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to products
        </Link>
      </div>

      <PageHeader
        title="Bulk upload products"
        description="Upload a CSV to create many products at once."
        actions={
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Download template
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Upload CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label htmlFor="csv-file" className="block text-sm font-medium mb-2">
              Select CSV file
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-foreground file:text-background hover:file:opacity-90 cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground mt-2">
                Loaded <span className="font-mono">{fileName}</span>
              </p>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription className="whitespace-pre-wrap">{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {products.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">
                Preview ({products.length} {products.length === 1 ? 'product' : 'products'})
              </CardTitle>
              <Button size="sm" onClick={handleBulkUpload} loading={loading}>
                <Upload className="h-4 w-4" />
                Upload all
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="hidden md:table-cell">UPC</TableHead>
                  <TableHead className="hidden md:table-cell">Size</TableHead>
                  <TableHead className="hidden lg:table-cell">Case pack</TableHead>
                  <TableHead>Americas</TableHead>
                  <TableHead>International</TableHead>
                  <TableHead className="hidden lg:table-cell">Enabled</TableHead>
                  <TableHead className="hidden lg:table-cell">Support funds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm font-medium">{p.item_name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="hidden md:table-cell font-mono text-xs">
                      {p.upc}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">{p.size}</TableCell>
                    <TableCell className="hidden lg:table-cell text-sm">{p.case_pack}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCurrency(p.price_americas)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatCurrency(p.price_international)}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.enable ? (
                        <Badge variant="success">Yes</Badge>
                      ) : (
                        <Badge variant="muted">No</Badge>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.list_in_support_funds ? (
                        <Badge variant="success">Yes</Badge>
                      ) : (
                        <Badge variant="muted">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">CSV format</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>The CSV needs these columns (case-insensitive header row):</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="font-mono text-foreground">item_name</span> — display name (required)</li>
            <li><span className="font-mono text-foreground">netsuite_name</span> — NetSuite product name (required)</li>
            <li><span className="font-mono text-foreground">sku</span> — SKU code (required)</li>
            <li><span className="font-mono text-foreground">upc</span> — UPC barcode (required)</li>
            <li><span className="font-mono text-foreground">size</span> — product size / volume (required)</li>
            <li><span className="font-mono text-foreground">case_pack</span> — units per case, number (required)</li>
            <li><span className="font-mono text-foreground">price_international</span> — number (required)</li>
            <li><span className="font-mono text-foreground">price_americas</span> — number (required)</li>
            <li><span className="font-mono text-foreground">enable</span> — true/false (required)</li>
            <li><span className="font-mono text-foreground">list_in_support_funds</span> — true/false (required)</li>
            <li><span className="font-mono text-foreground">visible_to_americas</span> — true/false (required)</li>
            <li><span className="font-mono text-foreground">visible_to_international</span> — true/false (required)</li>
            <li><span className="font-mono text-foreground">picture_url</span> — image URL (optional)</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
