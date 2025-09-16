'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import ClientLayout from '../../../components/ClientLayout';
import Link from 'next/link';
import Image from 'next/image';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  upc: string;
  size: string;
  case_pack: number;
  price_international: number;
  price_americas: number;
  picture_url?: string;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
}

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund?: { percent: number }[];
  class?: { name: string };
}

interface OrderItem {
  product_id: number;
  product: Product;
  case_qty: number;
  total_units: number;
  unit_price: number;
  total_price: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [poNumber, setPoNumber] = useState('');

  const getClientType = () => {
    if (!company?.class?.name) return 'Americas';
    
    const className = company.class.name.toLowerCase();
    return className.includes('international') ? 'International' : 'Americas';
  };

  const getProductPrice = (product: Product) => {
    if (!company?.class?.name) return product.price_americas;
    
    const className = company.class.name.toLowerCase();
    if (className.includes('international')) {
      return product.price_international;
    }
    return product.price_americas;
  };

  useEffect(() => {
    fetchCompanyData();
    
    // Fallback timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('Loading timeout reached, setting loading to false');
      setLoading(false);
    }, 10000); // 10 seconds timeout
    
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    console.log('Company useEffect triggered, company:', company);
    if (company) {
      console.log('Company found, calling fetchProducts');
      fetchProducts();
    } else {
      console.log('No company, setting loading to false');
      setLoading(false);
    }
  }, [company]);

  const fetchCompanyData = async () => {
    try {
      console.log('Fetching company data...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');
      
      console.log('User found:', user.id);

      // Get user's company info
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            class:classes(name)
          )
        `)
        .eq('id', user.id)
        .single();

      console.log('Company data result:', { clientData, clientError });
      console.log('Full clientData structure:', JSON.stringify(clientData, null, 2));

      if (clientError) {
        console.error('Company data error:', clientError);
        throw clientError;
      }
      
      console.log('clientData?.company:', clientData?.company);
      
      // Handle both array and single object cases
      const companyData = Array.isArray(clientData?.company) 
        ? clientData?.company?.[0] 
        : clientData?.company;
        
      console.log('companyData:', companyData);
      
      if (companyData) {
        // Transform class and support_fund shapes consistently
        const transformedCompany = {
          ...companyData,
          class: Array.isArray(companyData.class) ? companyData.class[0] : companyData.class,
          support_fund: Array.isArray(companyData.support_fund)
            ? companyData.support_fund
            : (companyData.support_fund ? [companyData.support_fund] : [])
        } as Company;
        console.log('Transformed company support_fund:', transformedCompany.support_fund);
        console.log('Setting company:', transformedCompany);
        setCompany(transformedCompany);
      } else {
        console.log('No company data found');
        setCompany(null);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error in fetchCompanyData:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      console.log('Fetching products...');
      
      // Get products visible to this client's class
      const clientClass = getClientType();
      const isInternational = clientClass.toLowerCase().includes('international');
      
      console.log('Client class:', clientClass, 'isInternational:', isInternational);
      
      let productsQuery = supabase
        .from('Products')
        .select('*')
        .eq('enable', true);
      
      // Check if visibility columns exist by trying a test query
      const { data: testData, error: testError } = await supabase
        .from('Products')
        .select('visible_to_americas, visible_to_international')
        .limit(1);
      
      if (testError && testError.code === 'PGRST116') {
        // Columns don't exist, use all products
        console.log('Visibility columns not found, showing all products');
      } else if (!testError) {
        // Columns exist, apply class filtering
        console.log('Visibility columns found, applying class filtering');
        if (isInternational) {
          productsQuery = productsQuery.eq('visible_to_international', true);
        } else {
          productsQuery = productsQuery.eq('visible_to_americas', true);
        }
      } else {
        console.log('Error checking visibility columns:', testError);
      }
      
      console.log('Executing products query...');
      const { data: productsData, error: productsError } = await productsQuery
        .order('item_name', { ascending: true });

      console.log('Products query result:', { productsData, productsError });

      if (productsError) {
        console.error('Products query error:', productsError);
        throw productsError;
      }
      
      console.log('Setting products:', productsData?.length || 0, 'products');
      setProducts(productsData || []);
    } catch (err: any) {
      console.error('Error in fetchProducts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCaseQtyChange = (productId: number, caseQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = caseQty * product.case_pack;
    const totalPrice = unitPrice * totalUnits;

    setOrderItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      
      if (caseQty === 0) {
        // Remove item if case qty is 0
        return prev.filter(item => item.product_id !== productId);
      }

      const newItem: OrderItem = {
        product_id: productId,
        product,
        case_qty: caseQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        // Update existing item
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        // Add new item
        return [...prev, newItem];
      }
    });
  };

  const getOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
    // Support fund percent can arrive as array or single
    const rawSf = company?.support_fund as any;
    const supportFundPercent = Array.isArray(rawSf)
      ? (rawSf[0]?.percent || 0)
      : (rawSf?.percent || 0);
    const supportFundEarned = subtotal * (supportFundPercent / 100);
    const total = subtotal;

    return {
      subtotal,
      supportFundPercent,
      supportFundEarned,
      total,
      itemCount: orderItems.length
    };
  };

  const handleSubmit = async () => {
    if (orderItems.length === 0) {
      setError('Please add at least one product to your order.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const totals = getOrderTotals();

      // Create the order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          user_id: user.id,
          company_id: company?.id,
          status: 'Open',
          total_value: totals.total,
          support_fund_used: 0, // Will be calculated in support fund redemption step
          po_number: poNumber || null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsData = orderItems.map(item => ({
        order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Redirect to support fund redemption if applicable
      if (totals.supportFundEarned > 0) {
        router.push(`/client/orders/${orderData.id}/support-fund`);
      } else {
        router.push(`/client/orders/${orderData.id}`);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error && !company) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href="/client"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const totals = getOrderTotals();

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">New Order</h1>
          <Link
            href="/client/orders"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Orders
          </Link>
        </div>
        {/* Main grid: Left content + Right sticky summary */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: company info + products */}
          <div className="xl:col-span-2 space-y-6">
            {/* Company Info */}
            {company && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Order Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Company</label>
                    <p className="text-lg">{company.company_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Client Type</label>
                    <p className="text-lg">{getClientType()}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Support Fund</label>
                    <p className="text-lg">{totals.supportFundPercent}%</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">PO/Cheque Number (Optional)</label>
                    <input
                      type="text"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="Enter PO number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Products Table */}
            <div className="bg-white rounded-lg shadow">
              <div className="overflow-x-auto">
                <table className="w-full table-fixed divide-y divide-gray-200" style={{tableLayout: 'fixed'}}>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-2 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{width: '30%'}}>
                        Product
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell" style={{width: '12%'}}>
                        SKU
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell" style={{width: '8%'}}>
                        Size
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell" style={{width: '8%'}}>
                        Case Pack
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{width: '10%'}}>
                        Price/Unit
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{width: '12%'}}>
                        Case Qty
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell" style={{width: '10%'}}>
                        Total Units
                      </th>
                      <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap" style={{width: '10%'}}>
                        Total USD
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {products.map((product) => {
                      const orderItem = orderItems.find(item => item.product_id === product.id);
                      const unitPrice = getProductPrice(product);
                      
                      return (
                        <tr key={product.id} className="hover:bg-gray-50">
                          <td className="px-2 py-3 whitespace-nowrap">
                            <div className="flex items-center min-w-0">
                              <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded overflow-hidden bg-gray-200">
                                {product.picture_url ? (
                                  <Image
                                    src={product.picture_url}
                                    alt={product.item_name}
                                    width={40}
                                    height={40}
                                    className="h-8 w-8 sm:h-10 sm:w-10 object-cover"
                                  />
                                ) : (
                                  <div className="h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center text-gray-400 text-xs">No Image</div>
                                )}
                              </div>
                              <div className="ml-2 flex-1 min-w-0">
                                <div 
                                  className="text-sm font-medium text-gray-900 truncate" 
                                  title={product.item_name}
                                >
                                  {product.item_name}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden sm:table-cell">
                            <div className="truncate" title={product.sku}>
                              {product.sku}
                            </div>
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden xl:table-cell">
                            <div className="truncate" title={product.size}>
                              {product.size}
                            </div>
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden xl:table-cell">
                            {product.case_pack}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 text-center">
                            ${unitPrice.toFixed(2)}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-center">
                            <div className="inline-flex items-center border border-gray-300 rounded select-none justify-center">
                              <button
                                type="button"
                                onClick={() => handleCaseQtyChange(product.id, Math.max(0, (orderItem?.case_qty || 0) - 1))}
                                className="px-1 py-1 text-gray-700 hover:bg-gray-100 focus:outline-none text-sm"
                              >
                                −
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={orderItem?.case_qty ?? 0}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const val = e.currentTarget.value.replace(/[^0-9]/g, '');
                                  if (val === '') {
                                    handleCaseQtyChange(product.id, 0);
                                    return;
                                  }
                                  const parsed = Number(val);
                                  handleCaseQtyChange(product.id, Math.max(0, Math.min(99, Math.floor(parsed))));
                                }}
                                className="w-8 px-1 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => handleCaseQtyChange(product.id, (orderItem?.case_qty || 0) + 1)}
                                className="px-1 py-1 text-gray-700 hover:bg-gray-100 focus:outline-none text-sm"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden sm:table-cell">
                            {orderItem?.total_units || 0}
                          </td>
                          <td className="px-2 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center">
                            ${orderItem?.total_price?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile/Tablet Order Summary (visible below xl) */}
            <div className="xl:hidden bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold">Order Summary</h2>
              {orderItems.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Items:</span>
                      <span className="font-medium">{totals.itemCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
                    </div>
                    {totals.supportFundEarned > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Support Fund ({totals.supportFundPercent}%):</span>
                        <span className="font-medium">${totals.supportFundEarned.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-lg font-semibold">Total:</span>
                      <span className="text-lg font-semibold">${totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex justify-end space-x-4">
                    <Link
                      href="/client/orders"
                      className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
                    >
                      Cancel
                    </Link>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || orderItems.length === 0}
                      className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                    >
                      {submitting ? 'Creating Order...' : (totals.supportFundEarned > 0 ? 'Next: Redeem Support Funds' : 'Create Order')}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Please add items to your order</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: sticky order summary (visible at xl+) */}
          <div className="hidden xl:block xl:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-6 space-y-4">
              <h2 className="text-lg font-semibold">Order Summary</h2>

              {orderItems.length > 0 ? (
                <>
                  {/* Item list - compact lines, no images */}
                  <div className="space-y-2">
                    {orderItems.map((item) => (
                      <div key={item.product_id} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="text-sm font-medium text-gray-900 truncate leading-tight">{item.product.item_name}</div>
                          <div className="text-xs text-gray-500 leading-tight">
                            {item.total_units} units • {item.case_qty} case{item.case_qty !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-gray-900">${item.total_price.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Totals */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Items:</span>
                      <span className="font-medium">{totals.itemCount}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Subtotal:</span>
                      <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
                    </div>
                    {totals.supportFundEarned > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Support Fund ({totals.supportFundPercent}%):</span>
                        <span className="font-medium">${totals.supportFundEarned.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-lg font-semibold">Total:</span>
                      <span className="text-lg font-semibold">${totals.total.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Next: Redeem Support Funds button */}
                  {totals.supportFundEarned > 0 && (
                    <button
                      onClick={handleSubmit}
                      disabled={submitting || orderItems.length === 0}
                      className="mt-4 w-full bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                    >
                      {submitting ? 'Processing...' : 'Next: Redeem Support Funds'}
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Please add items to your order</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
