'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  enable: boolean;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  picture_url?: string;
  netsuite_name?: string;
  upc?: string;
  size?: string;
  case_pack?: number;
  case_weight?: number;
  hs_code?: string;
  made_in?: string;
  category_id?: number;
  created_at: string;
}

export default function ProductViewPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    checkAdminAccess();
    fetchProduct();
  }, [params.id]);
  
  // Set breadcrumb when product is loaded
  useEffect(() => {
    if (product && (window as any).__setBreadcrumbs) {
      (window as any).__setBreadcrumbs([
        { label: product.item_name }
      ]);
    }
    return () => {
      if ((window as any).__setBreadcrumbs) {
        (window as any).__setBreadcrumbs([]);
      }
    };
  }, [product]);

  const checkAdminAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/');
      return;
    }

    // Check if user is in admins table
    const { data: adminProfile } = await supabase
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!adminProfile) {
      router.push('/');
    }
  };

  const fetchProduct = async () => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select('*')
        .eq('id', params.id)
        .single();

      if (error) throw error;
      setProduct(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
          <p>Loading product...</p>
        </div>
    );
  }

  if (error || !product) {
    return (
      <div className="p-6">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error || 'Product not found'}
          </div>
          <Link
            href="/admin/products"
            className="mt-4 inline-block text-blue-600 hover:text-blue-800"
          >
            ← Back to Products
          </Link>
        </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">{product.item_name}</h2>
        <div className="flex gap-2">
          <Link
            href={`/admin/products/${product.id}/edit`}
            className="bg-green-600 text-white px-4 py-2 rounded hover:opacity-90 transition text-sm"
          >
            Edit Product
          </Link>
          <Link
            href="/admin/products"
            className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition text-sm"
          >
            Back to Products
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Column - Basic Info & Pricing */}
        <div className="space-y-6">
          <Card title="Product Information">
            <div className="space-y-4">
              {/* Product Image */}
              {product.picture_url && (
                <div className="flex justify-center">
                  <img
                    src={product.picture_url}
                    alt={product.item_name}
                    className="w-full max-w-xs rounded-lg"
                  />
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">Product ID</p>
                  <p className="font-medium">{product.id}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">SKU</p>
                  <p className="font-medium">{product.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">NetSuite Name</p>
                  <p className="font-medium">{product.netsuite_name || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">UPC</p>
                  <p className="font-medium">{product.upc || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Size</p>
                  <p className="font-medium">{product.size || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Case Pack</p>
                  <p className="font-medium">{product.case_pack || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Case Weight</p>
                  <p className="font-medium">{product.case_weight ? `${product.case_weight} kg` : 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">HS Code</p>
                  <p className="font-medium">{product.hs_code || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Made In</p>
                  <p className="font-medium">{product.made_in || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500 mb-1">Created</p>
                  <p className="font-medium text-sm">{new Date(product.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card title="Pricing">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500 mb-1">Americas Price</p>
                <p className="font-medium text-lg">${product.price_americas.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500 mb-1">International Price</p>
                <p className="font-medium text-lg">${product.price_international.toFixed(2)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Status & Settings */}
        <div className="space-y-6">
          <Card title="Status & Visibility">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500 mb-2">Product Status</p>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  product.enable ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {product.enable ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Support Funds Eligible</p>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  product.list_in_support_funds ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {product.list_in_support_funds ? 'Yes' : 'No'}
                </span>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Visible to Americas</p>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  product.visible_to_americas ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {product.visible_to_americas ? 'Yes' : 'No'}
                </span>
              </div>

              <div>
                <p className="text-sm text-gray-500 mb-2">Visible to International</p>
                <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${
                  product.visible_to_international ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                }`}>
                  {product.visible_to_international ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
