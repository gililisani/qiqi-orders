'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import ClientLayout from '../../../../components/ClientLayout';
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
  qualifies_for_credit_earning: boolean;
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

interface Order {
  id: string;
  status: string;
  po_number: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  company?: {
    company_name: string;
  };
}

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [supportFundItems, setSupportFundItems] = useState<OrderItem[]>([]);
  const [showSupportFundRedemption, setShowSupportFundRedemption] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [poNumber, setPoNumber] = useState('');

  // Generate 6-character alphanumeric PO number
  const generatePONumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

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
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  useEffect(() => {
    if (company && order) {
      fetchProducts();
    }
  }, [company, order]);

  const fetchOrder = async () => {
    try {
      console.log('EditOrder: Fetching order data for ID:', orderId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(company_name)
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      console.log('EditOrder: Order query result:', { data, error });

      if (error) throw error;
      
      // Check if order can be edited
      if (data.status !== 'Open') {
        setError('This order cannot be edited because its status is not "Open".');
        return;
      }
      
      setOrder(data);
      setPoNumber(data.po_number || '');
      
      // Fetch company data
      await fetchCompanyData();
      
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchCompanyData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            class:classes(name),
            subsidiary:subsidiaries(name),
            location:Locations(location_name)
          )
        `)
        .eq('id', user.id)
        .single();

      console.log('EditOrder: Company query result:', { clientData, clientError });

      if (clientError) throw clientError;
      
      const rawCompanyData = clientData?.company?.[0];
      console.log('EditOrder: Raw company data:', rawCompanyData);
      
      if (rawCompanyData) {
        // Handle the company data structure properly
        const companyData: Company = {
          id: rawCompanyData.id,
          company_name: rawCompanyData.company_name,
          netsuite_number: rawCompanyData.netsuite_number,
          support_fund: rawCompanyData.support_fund || [],
          class: rawCompanyData.class?.[0] || undefined
        };
        console.log('EditOrder: Setting company data:', companyData);
        setCompany(companyData);
      }
      
    } catch (err: any) {
      console.error('Error fetching company data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const clientType = getClientType();
      const visibilityColumn = clientType === 'International' ? 'visible_to_international' : 'visible_to_americas';
      
      const { data, error } = await supabase
        .from('Products')
        .select('*')
        .eq(visibilityColumn, true)
        .order('item_name');

      if (error) throw error;
      setProducts(data || []);
      
      // Fetch existing order items after products are loaded
      await fetchOrderItems();
      
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setError(err.message);
    }
  };

  const fetchOrderItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(*)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      
      // Convert database items to our format
      const regularItems: OrderItem[] = [];
      const supportItems: OrderItem[] = [];
      
      data?.forEach(item => {
        if (item.product) {
          const orderItem: OrderItem = {
            product_id: item.product.id,
            product: item.product,
            case_qty: Math.ceil(item.quantity / item.product.case_pack), // Convert back to cases
            total_units: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price
          };
          
          if (item.is_support_fund_item) {
            supportItems.push(orderItem);
          } else {
            regularItems.push(orderItem);
          }
        }
      });
      
      setOrderItems(regularItems);
      setSupportFundItems(supportItems);
      
      // Show support fund redemption if there are support fund items
      if (supportItems.length > 0) {
        setShowSupportFundRedemption(true);
      }
      
    } catch (err: any) {
      console.error('Error fetching order items:', err);
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
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        return [...prev, newItem];
      }
    });
  };

  const getOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // FIXED: Only include products that qualify for credit earning
    const creditEarningItems = orderItems.filter(item => item.product.qualifies_for_credit_earning);
    const creditEarningSubtotal = creditEarningItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // Support fund percent can arrive as array or single
    const rawSf = company?.support_fund as any;
    const supportFundPercent = Array.isArray(rawSf)
      ? (rawSf[0]?.percent || 0)
      : (rawSf?.percent || 0);
    const supportFundEarned = creditEarningSubtotal * (supportFundPercent / 100);
    const total = subtotal;

    return {
      subtotal,
      supportFundPercent,
      supportFundEarned,
      total,
      itemCount: orderItems.length
    };
  };

  const handleSupportFundItemChange = (productId: number, caseQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = caseQty * product.case_pack;
    const totalPrice = unitPrice * totalUnits;

    setSupportFundItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      
      if (caseQty === 0) {
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
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        return [...prev, newItem];
      }
    });
  };

  const getSupportFundTotals = () => {
    const subtotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
    const originalOrderTotals = getOrderTotals();
    const supportFundEarned = originalOrderTotals.supportFundEarned;
    const remainingCredit = supportFundEarned - subtotal;
    const finalTotal = remainingCredit < 0 ? Math.abs(remainingCredit) : 0;
    
    return {
      subtotal,
      supportFundEarned,
      remainingCredit,
      finalTotal,
      itemCount: supportFundItems.length
    };
  };

  const handleSave = async () => {
    if (orderItems.length === 0) {
      setError('Please add at least one product to your order.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const originalTotals = getOrderTotals();
      const supportTotals = getSupportFundTotals();
      
      const supportFundUsed = Math.min(supportTotals.subtotal, originalTotals.supportFundEarned);
      const additionalCost = Math.max(0, supportTotals.subtotal - originalTotals.supportFundEarned);
      const finalTotal = originalTotals.total + additionalCost;

      // Generate PO number if not provided
      const finalPONumber = poNumber || generatePONumber();

      // Update the order
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          po_number: finalPONumber,
          total_value: finalTotal,
          support_fund_used: supportFundUsed,
          credit_earned: originalTotals.supportFundEarned
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // Delete existing order items
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);

      if (deleteError) throw deleteError;

      // Create order items (both regular and support fund items)
      const regularItemsData = orderItems.map(item => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: false
      }));

      const supportFundItemsData = supportFundItems.map(item => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: true
      }));

      const allItemsData = [...regularItemsData, ...supportFundItemsData];

      if (allItemsData.length > 0) {
        const { error: insertError } = await supabase
          .from('order_items')
          .insert(allItemsData);

        if (insertError) throw insertError;
      }

      // Redirect back to order view
      router.push(`/client/orders/${orderId}`);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex justify-center items-center min-h-64">
          <div className="text-lg">Loading order...</div>
        </div>
      </ClientLayout>
    );
  }

  if (error) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="text-red-600 text-lg font-medium mb-4">{error}</div>
          <Link
            href={`/client/orders/${orderId}`}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Order
          </Link>
        </div>
      </ClientLayout>
    );
  }

  if (!order || !company) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="text-gray-600 text-lg">Order not found</div>
        </div>
      </ClientLayout>
    );
  }

  const totals = getOrderTotals();
  const supportFundTotals = getSupportFundTotals();
  const clientType = getClientType();

  return (
    <ClientLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="xl:grid xl:grid-cols-12 xl:gap-8">
            {/* Main Content */}
            <div className="xl:col-span-8 space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Edit Order</h1>
                  <p className="text-gray-600 mt-1">
                    {company.company_name} - {clientType} Pricing
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={handleSave}
                    disabled={submitting || orderItems.length === 0}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Saving...' : 'Save Changes'}
                  </button>
                  <Link
                    href={`/client/orders/${orderId}`}
                    className="text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </Link>
                </div>
              </div>

              {/* PO Number */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Order Details</h3>
                <div className="max-w-md">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    PO/Cheque Number (Optional)
                  </label>
                  <input
                    type="text"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                    placeholder="Enter PO/Cheque number or leave blank for auto-generation"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              {/* Tab Navigation */}
              {totals.supportFundPercent > 0 && (
                <div className="bg-white rounded-lg shadow">
                  <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                      <button
                        onClick={() => setShowSupportFundRedemption(false)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                          !showSupportFundRedemption
                            ? 'border-black text-black'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Order Form
                      </button>
                      <button
                        onClick={() => setShowSupportFundRedemption(true)}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                          showSupportFundRedemption
                            ? 'border-green-600 text-green-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        Distributor Support Funds
                        <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ${totals.supportFundEarned.toFixed(2)} available
                        </span>
                      </button>
                    </nav>
                  </div>
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
                      {(showSupportFundRedemption ? products.filter(p => p.list_in_support_funds) : products).map((product) => {
                        const orderItem = showSupportFundRedemption 
                          ? supportFundItems.find(item => item.product_id === product.id)
                          : orderItems.find(item => item.product_id === product.id);
                        const unitPrice = getProductPrice(product);
                        
                        return (
                          <tr key={product.id} className="hover:bg-gray-50">
                            <td className="px-2 py-3 whitespace-nowrap">
                              <div className="flex items-center min-w-0">
                                <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded overflow-hidden bg-gray-200">
                                  {product.picture_url ? (
                                    <img
                                      src={product.picture_url}
                                      alt={product.item_name}
                                      className="h-8 w-8 sm:h-10 sm:w-10 object-cover"
                                      onError={(e) => {
                                        console.error('Image failed to load:', product.picture_url);
                                        e.currentTarget.style.display = 'none';
                                        const noImageDiv = e.currentTarget.nextElementSibling as HTMLElement;
                                        if (noImageDiv) noImageDiv.style.display = 'flex';
                                      }}
                                    />
                                  ) : null}
                                  <div 
                                    className="h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center text-gray-400 text-xs"
                                    style={{display: product.picture_url ? 'none' : 'flex'}}
                                  >
                                    No Image
                                  </div>
                                </div>
                                <div className="ml-2 flex-1 min-w-0">
                                  <div 
                                    className="text-sm font-medium text-gray-900 truncate" 
                                    title={product.item_name}
                                  >
                                    {product.item_name}
                                  </div>
                                  {!showSupportFundRedemption && product.qualifies_for_credit_earning && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 mt-1">
                                      Earns Credit
                                    </span>
                                  )}
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
                                  onClick={() => showSupportFundRedemption 
                                    ? handleSupportFundItemChange(product.id, Math.max(0, (orderItem?.case_qty || 0) - 1))
                                    : handleCaseQtyChange(product.id, Math.max(0, (orderItem?.case_qty || 0) - 1))
                                  }
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
                                      if (showSupportFundRedemption) {
                                        handleSupportFundItemChange(product.id, 0);
                                      } else {
                                        handleCaseQtyChange(product.id, 0);
                                      }
                                      return;
                                    }
                                    const parsed = Number(val);
                                    if (showSupportFundRedemption) {
                                      handleSupportFundItemChange(product.id, Math.max(0, Math.min(99, Math.floor(parsed))));
                                    } else {
                                      handleCaseQtyChange(product.id, Math.max(0, Math.min(99, Math.floor(parsed))));
                                    }
                                  }}
                                  className="w-8 px-1 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => showSupportFundRedemption 
                                    ? handleSupportFundItemChange(product.id, (orderItem?.case_qty || 0) + 1)
                                    : handleCaseQtyChange(product.id, (orderItem?.case_qty || 0) + 1)
                                  }
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
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
                      </div>

                      {/* Credit Earned */}
                      {totals.supportFundPercent > 0 && (
                        <div className="flex justify-between text-sm text-green-600 pt-2">
                          <span>Credit Earned ({totals.supportFundPercent}%):</span>
                          <span className="font-medium">${totals.supportFundEarned.toFixed(2)}</span>
                        </div>
                      )}
                      
                      <div className="border-t pt-2">
                        <div className="flex justify-between">
                          <span className="text-lg font-semibold">Total Order:</span>
                          <span className="text-lg font-semibold">${(totals.total + (supportFundTotals.remainingCredit < 0 ? Math.abs(supportFundTotals.remainingCredit) : 0)).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {supportFundItems.length > 0 && (
                      <div className="text-xs text-gray-500 italic pt-2 space-y-1">
                        <div>* Credit cannot be accumulated and must be redeemed in full per order</div>
                        <div>* Any unused Support Fund credit will be forfeited</div>
                        <div>* Negative remaining credit will be added to the grand total</div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-gray-500">No items selected</p>
                )}
              </div>
            </div>

            {/* Desktop Sidebar (visible on xl+) */}
            <div className="hidden xl:block xl:col-span-4">
              <div className="sticky top-8 space-y-6">
                {/* Order Summary */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
                  {orderItems.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Items:</span>
                        <span className="font-medium">{totals.itemCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Subtotal:</span>
                        <span className="font-medium">${totals.subtotal.toFixed(2)}</span>
                      </div>

                      {/* Credit Earned */}
                      {totals.supportFundPercent > 0 && (
                        <div className="flex justify-between text-sm text-green-600 pt-2">
                          <span>Credit Earned ({totals.supportFundPercent}%):</span>
                          <span className="font-medium">${totals.supportFundEarned.toFixed(2)}</span>
                        </div>
                      )}
                      
                      <div className="border-t pt-2">
                        <div className="flex justify-between">
                          <span className="text-lg font-semibold">Total Order:</span>
                          <span className="text-lg font-semibold">${(totals.total + (supportFundTotals.remainingCredit < 0 ? Math.abs(supportFundTotals.remainingCredit) : 0)).toFixed(2)}</span>
                        </div>
                      </div>

                      {supportFundItems.length > 0 && (
                        <div className="text-xs text-gray-500 italic pt-2 space-y-1">
                          <div>* Credit cannot be accumulated and must be redeemed in full per order</div>
                          <div>* Any unused Support Fund credit will be forfeited</div>
                          <div>* Negative remaining credit will be added to the grand total</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-gray-500">No items selected</p>
                  )}
                </div>

                {/* Support Fund Summary */}
                {showSupportFundRedemption && supportFundItems.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-green-800 mb-4">Support Fund Summary</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Support Fund Items:</span>
                        <span className="font-medium">${supportFundTotals.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Available Credit:</span>
                        <span className="font-medium">${supportFundTotals.supportFundEarned.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-medium pt-2">
                        <span>Remaining Credit:</span>
                        <span className={(() => {
                          const creditEarned = totals.supportFundEarned;
                          const supportFundTotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
                          const remaining = creditEarned - supportFundTotal;
                          return remaining < 0 ? 'text-red-600' : 'text-green-600';
                        })()}>
                          {(() => {
                            const creditEarned = totals.supportFundEarned;
                            const supportFundTotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
                            const remaining = creditEarned - supportFundTotal;
                            return remaining < 0 ? `($${Math.abs(remaining).toFixed(2)})` : `$${remaining.toFixed(2)}`;
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}