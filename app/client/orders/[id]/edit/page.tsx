'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import ClientLayout from '../../../../components/ClientLayout';
import Link from 'next/link';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  price_international: number;
  price_americas: number;
  case_pack: number;
  qualifies_for_credit_earning: boolean;
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

interface Company {
  id: string;
  company_name: string;
  support_fund?: { percent: number }[];
}

export default function EditOrder() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [supportFundItems, setSupportFundItems] = useState<OrderItem[]>([]);
  const [showSupportFundRedemption, setShowSupportFundRedemption] = useState(false);
  const [poNumber, setPONumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Generate 6-character alphanumeric PO number
  const generatePONumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      fetchProducts();
      fetchCompany();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
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

      if (error) throw error;
      
      // Check if order can be edited
      if (data.status !== 'Open') {
        setError('This order cannot be edited because its status is not "Open".');
        return;
      }
      
      setOrder(data);
      setPONumber(data.po_number || '');
      
      // Fetch existing order items
      await fetchOrderItems();
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(id, item_name, sku, price_international, price_americas, case_pack, qualifies_for_credit_earning)
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

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select('*')
        .order('item_name');

      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchCompany = async () => {
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
            support_fund:support_fund_levels(percent)
          )
        `)
        .eq('id', user.id)
        .single();

      if (clientError) throw clientError;
      setCompany(clientData?.company?.[0] || null);
      
    } catch (err: any) {
      console.error('Error fetching company:', err);
    }
  };

  const getProductPrice = (product: Product): number => {
    return product.price_americas; // Default to Americas pricing
  };

  const handleItemChange = (productId: number, caseQty: number) => {
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
    
    // Only include products that qualify for credit earning
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

  const handleSupportFundRedemption = () => {
    const totals = getOrderTotals();
    if (totals.supportFundEarned > 0) {
      setShowSupportFundRedemption(true);
    }
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

  if (!order) {
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

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Edit Order</h1>
            {order?.company?.company_name && (
              <h2 className="text-lg font-medium text-gray-700 mt-1">{order.company.company_name}</h2>
            )}
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSave}
              disabled={submitting}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm disabled:opacity-50"
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
        <div className="bg-white p-6 rounded-lg shadow border">
          <h3 className="text-lg font-semibold mb-4">Order Details</h3>
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PO Number (Optional)
            </label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPONumber(e.target.value)}
              placeholder="Enter PO number or leave blank for auto-generation"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Regular Products */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Regular Products</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {products.map(product => {
                const existingItem = orderItems.find(item => item.product_id === product.id);
                const currentCaseQty = existingItem?.case_qty || 0;
                
                return (
                  <div key={product.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-gray-900 text-sm">{product.item_name}</h4>
                      {product.qualifies_for_credit_earning && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Earns Credit
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-2">SKU: {product.sku}</p>
                    <p className="text-sm text-gray-700 mb-3">
                      ${getProductPrice(product).toFixed(2)} per unit
                      <br />
                      <span className="text-xs text-gray-500">
                        {product.case_pack} units/case
                      </span>
                    </p>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleItemChange(product.id, Math.max(0, currentCaseQty - 1))}
                        className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300"
                      >
                        -
                      </button>
                      <span className="w-12 text-center font-medium">{currentCaseQty}</span>
                      <button
                        onClick={() => handleItemChange(product.id, currentCaseQty + 1)}
                        className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white hover:bg-blue-700"
                      >
                        +
                      </button>
                    </div>
                    {currentCaseQty > 0 && (
                      <div className="mt-2 text-xs text-gray-600">
                        {currentCaseQty} case{currentCaseQty !== 1 ? 's' : ''} = {currentCaseQty * product.case_pack} units
                        <br />
                        Total: ${(currentCaseQty * product.case_pack * getProductPrice(product)).toFixed(2)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Order Summary */}
        <div className="bg-white rounded-lg shadow border p-6">
          <h3 className="text-lg font-semibold mb-4">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Subtotal ({totals.itemCount} items):</span>
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
                <span className="text-lg font-semibold">Total:</span>
                <span className="text-lg font-semibold">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Support Fund Redemption Button */}
          {totals.supportFundEarned > 0 && !showSupportFundRedemption && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-green-800">Support Fund Available</h4>
                  <p className="text-sm text-green-700">
                    You have ${totals.supportFundEarned.toFixed(2)} in support fund credit available to redeem.
                  </p>
                </div>
                <button
                  onClick={handleSupportFundRedemption}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm"
                >
                  Redeem Credit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Support Fund Products */}
        {showSupportFundRedemption && (
          <div className="bg-white rounded-lg shadow border">
            <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-green-800">Support Fund Products</h3>
                <button
                  onClick={() => setShowSupportFundRedemption(false)}
                  className="text-green-600 hover:text-green-800 text-sm"
                >
                  Hide
                </button>
              </div>
              <p className="text-sm text-green-700 mt-1">
                Use your ${totals.supportFundEarned.toFixed(2)} support fund credit to purchase these products.
              </p>
            </div>
            
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {products.map(product => {
                  const existingItem = supportFundItems.find(item => item.product_id === product.id);
                  const currentCaseQty = existingItem?.case_qty || 0;
                  
                  return (
                    <div key={product.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                      <h4 className="font-medium text-gray-900 text-sm mb-2">{product.item_name}</h4>
                      <p className="text-xs text-gray-500 mb-2">SKU: {product.sku}</p>
                      <p className="text-sm text-gray-700 mb-3">
                        ${getProductPrice(product).toFixed(2)} per unit
                        <br />
                        <span className="text-xs text-gray-500">
                          {product.case_pack} units/case
                        </span>
                      </p>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleSupportFundItemChange(product.id, Math.max(0, currentCaseQty - 1))}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-300"
                        >
                          -
                        </button>
                        <span className="w-12 text-center font-medium">{currentCaseQty}</span>
                        <button
                          onClick={() => handleSupportFundItemChange(product.id, currentCaseQty + 1)}
                          className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white hover:bg-green-700"
                        >
                          +
                        </button>
                      </div>
                      {currentCaseQty > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          {currentCaseQty} case{currentCaseQty !== 1 ? 's' : ''} = {currentCaseQty * product.case_pack} units
                          <br />
                          Total: ${(currentCaseQty * product.case_pack * getProductPrice(product)).toFixed(2)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Support Fund Totals */}
              {supportFundItems.length > 0 && (
                <div className="mt-6 p-4 bg-green-100 border border-green-200 rounded-lg">
                  <h4 className="text-sm font-semibold text-green-800 mb-2">Support Fund Summary</h4>
                  <div className="space-y-1 text-sm">
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

                  {supportFundItems.length > 0 && (
                    <div className="text-xs text-gray-500 italic pt-2 space-y-1">
                      <div>* Credit cannot be accumulated and must be redeemed in full per order</div>
                      <div>* Any unused Support Fund credit will be forfeited</div>
                      <div>* Negative remaining credit will be added to the grand total</div>
                    </div>
                  )}
                </div>
              )}

              {/* Final Order Summary with Support Fund */}
              <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Final Order Summary</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span>Regular Items:</span>
                    <span className="font-medium">${totals.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Support Fund Items:</span>
                    <span className="font-medium">${supportFundTotals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between">
                      <span className="text-lg font-semibold">Total Order:</span>
                      <span className="text-lg font-semibold">${(totals.total + (supportFundTotals.remainingCredit < 0 ? Math.abs(supportFundTotals.remainingCredit) : 0)).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}