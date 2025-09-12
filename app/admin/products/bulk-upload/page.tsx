'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';

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
  picture_url?: string;
  image_file?: File;
}

export default function BulkUploadProducts() {
  const router = useRouter();
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [previewMode, setPreviewMode] = useState(false);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCsvFile(file);
      parseCSV(file);
    } else {
      setError('Please select a valid CSV file.');
    }
  };

  const parseCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        setError('CSV file must have at least a header row and one data row.');
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = [
        'item_name', 'netsuite_name', 'sku', 'upc', 'size', 
        'case_pack', 'price_international', 'price_americas', 
        'enable', 'list_in_support_funds'
      ];

      // Check if all required headers are present
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        setError(`Missing required headers: ${missingHeaders.join(', ')}`);
        return;
      }

      const parsedProducts: ProductData[] = [];
      
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        
        if (values.length !== headers.length) {
          setError(`Row ${i + 1} has incorrect number of columns. Expected ${headers.length}, got ${values.length}`);
          return;
        }

        const product: ProductData = {
          item_name: values[headers.indexOf('item_name')] || '',
          netsuite_name: values[headers.indexOf('netsuite_name')] || '',
          sku: values[headers.indexOf('sku')] || '',
          upc: values[headers.indexOf('upc')] || '',
          size: values[headers.indexOf('size')] || '',
          case_pack: parseInt(values[headers.indexOf('case_pack')]) || 0,
          price_international: parseFloat(values[headers.indexOf('price_international')]) || 0,
          price_americas: parseFloat(values[headers.indexOf('price_americas')]) || 0,
          enable: values[headers.indexOf('enable')].toLowerCase() === 'true',
          list_in_support_funds: values[headers.indexOf('list_in_support_funds')].toLowerCase() === 'true',
          picture_url: values[headers.indexOf('picture_url')] || undefined
        };

        parsedProducts.push(product);
      }

      setProducts(parsedProducts);
      setError('');
    };
    reader.readAsText(file);
  };

  const handleBulkUpload = async () => {
    if (products.length === 0) {
      setError('No products to upload.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error } = await supabase
        .from('Products')
        .insert(products);

      if (error) throw error;

      setSuccess(`Successfully uploaded ${products.length} products!`);
      setProducts([]);
      setCsvFile(null);
      
      // Reset file input
      const fileInput = document.getElementById('csv-file') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadTemplate = () => {
    const headers = [
      'item_name', 'netsuite_name', 'sku', 'upc', 'size', 
      'case_pack', 'price_international', 'price_americas', 
      'enable', 'list_in_support_funds', 'picture_url'
    ];
    
    const sampleData = [
      'Sample Product', 'Sample NetSuite Name', 'SAMPLE001', '123456789012', '250ml',
      '12', '25.50', '30.00', 'true', 'true', 'https://example.com/image.jpg'
    ];

    const csvContent = [headers, sampleData].map(row => row.join(',')).join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'products_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Bulk Upload Products</h1>
          <button
            onClick={() => router.push('/admin/products')}
            className="bg-gray-500 text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Products
          </button>
        </div>

        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-lg font-semibold mb-4">Upload CSV File</h2>
          
          <div className="mb-4">
            <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700 mb-2">
              Select CSV File
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-black file:text-white hover:file:opacity-90"
            />
          </div>

          <div className="mb-4">
            <button
              onClick={downloadTemplate}
              className="bg-blue-500 text-white px-4 py-2 rounded hover:opacity-90 transition mr-2"
            >
              Download Template
            </button>
            <span className="text-sm text-gray-600">
              Download the CSV template to see the required format
            </span>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
              {success}
            </div>
          )}
        </div>

        {products.length > 0 && (
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">
                Preview Products ({products.length} products)
              </h2>
              <div className="space-x-2">
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:opacity-90 transition"
                >
                  {previewMode ? 'Hide Preview' : 'Show Preview'}
                </button>
                <button
                  onClick={handleBulkUpload}
                  disabled={loading}
                  className="bg-green-500 text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                >
                  {loading ? 'Uploading...' : 'Upload All Products'}
                </button>
              </div>
            </div>

            {previewMode && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Item Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        SKU
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        UPC
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Size
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Case Pack
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Int. Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amer. Price
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Enabled
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Support Funds
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map((product, index) => (
                      <tr key={index}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.item_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.sku}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.upc}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.size}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.case_pack}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${product.price_international.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          ${product.price_americas.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.enable ? 'Yes' : 'No'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {product.list_in_support_funds ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded mt-6">
          <h3 className="font-semibold mb-2">CSV Format Requirements:</h3>
          <ul className="text-sm list-disc list-inside space-y-1">
            <li><strong>item_name:</strong> Product display name (required)</li>
            <li><strong>netsuite_name:</strong> NetSuite product name (required)</li>
            <li><strong>sku:</strong> Product SKU code (required)</li>
            <li><strong>upc:</strong> UPC barcode number (required)</li>
            <li><strong>size:</strong> Product size/volume (required)</li>
            <li><strong>case_pack:</strong> Units per case (number, required)</li>
            <li><strong>price_international:</strong> International distributor price (number, required)</li>
            <li><strong>price_americas:</strong> Americas distributor price (number, required)</li>
            <li><strong>enable:</strong> true/false (required)</li>
            <li><strong>list_in_support_funds:</strong> true/false (required)</li>
            <li><strong>picture_url:</strong> Image URL (optional) - For now, use URLs. Direct image upload coming soon!</li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
