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
  qualifies_for_credit_earning: boolean;
}

interface OrderItem {
  id: string;
  product_id: number;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item: boolean;
  product?: Product;
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
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [poNumber, setPONumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      fetchOrderItems();
      fetchProducts();
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
          company:companies(
            company_name,
            support_fund:support_fund_levels(percent)
          )
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
      
      // Get company info for the user
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
      setCompany(clientData?.company);
      
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
          product:Products(id, item_name, sku, price_international, price_americas, qualifies_for_credit_earning)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setOrderItems(data || []);
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

  const updateQuantity = (itemId: string, newQuantity: number) => {
    if (newQuantity < 0) return;
    
    setOrderItems(items => 
      items.map(item => {
        if (item.id === itemId) {
          const updatedItem = {
            ...item,
            quantity: newQuantity,
            total_price: newQuantity * item.unit_price
          };
          return updatedItem;
        }
        return item;
      })
    );
  };

  const removeItem = (itemId: string) => {
    setOrderItems(items => items.filter(item => item.id !== itemId));
  };

  const addProduct = (productId: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const newItem: OrderItem = {
      id: `temp-${Date.now()}`, // Temporary ID for new items
      product_id: productId,
      quantity: 1,
      unit_price: product.price_americas, // Default to Americas pricing
      total_price: product.price_americas,
      is_support_fund_item: false,
      product: product
    };

    setOrderItems(items => [...items, newItem]);
  };

  const calculateTotals = () => {
    const regularItems = orderItems.filter(item => !item.is_support_fund_item);
    const supportFundItems = orderItems.filter(item => item.is_support_fund_item);
    
    const regularSubtotal = regularItems.reduce((sum, item) => sum + item.total_price, 0);
    const supportFundSubtotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // Calculate credit earned from qualifying products
    const creditEarningItems = regularItems.filter(item => item.product?.qualifies_for_credit_earning);
    const creditEarningSubtotal = creditEarningItems.reduce((sum, item) => sum + item.total_price, 0);
    const supportFundPercent = company?.support_fund?.[0]?.percent || 0;
    const creditEarned = creditEarningSubtotal * (supportFundPercent / 100);
    
    return {
      regularSubtotal,
      supportFundSubtotal,
      creditEarned,
      total: regularSubtotal + Math.max(0, supportFundSubtotal - creditEarned)
    };
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError('');

      const totals = calculateTotals();
      const finalPONumber = poNumber || order?.po_number || '';

      // Update order
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          po_number: finalPONumber,
          total_value: totals.total,
          support_fund_used: totals.supportFundSubtotal,
          credit_earned: totals.creditEarned
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // Delete existing order items
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);

      if (deleteError) throw deleteError;

      // Insert updated order items
      const orderItemsData = orderItems.map(item => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: item.is_support_fund_item
      }));

      const { error: insertError } = await supabase
        .from('order_items')
        .insert(orderItemsData);

      if (insertError) throw insertError;

      // Redirect back to order view
      router.push(`/client/orders/${orderId}`);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
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

  const totals = calculateTotals();

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
              disabled={saving}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition text-sm disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
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

        {/* Order Items */}
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold">Order Items</h3>
            <select
              onChange={(e) => {
                const productId = parseInt(e.target.value);
                if (productId) {
                  addProduct(productId);
                  e.target.value = '';
                }
              }}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Add Product</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.item_name} - ${product.price_americas.toFixed(2)}
                </option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {orderItems.map((item) => (
                  <tr key={item.id} className={item.is_support_fund_item ? 'bg-green-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product?.item_name || 'N/A'}
                        </div>
                        {item.is_support_fund_item && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Support Fund
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 0)}
                        min="0"
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ${item.unit_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ${item.total_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {orderItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No items in this order.</p>
              <p className="text-sm mt-2">Use the dropdown above to add products.</p>
            </div>
          )}
        </div>

        {/* Order Totals */}
        <div className="bg-white rounded-lg shadow border p-6">
          <h3 className="text-lg font-semibold mb-4">Order Summary</h3>
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Regular Items:</span>
              <span className="font-medium">${totals.regularSubtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-green-600">
              <span>Credit Earned ({company?.support_fund?.[0]?.percent || 0}%):</span>
              <span className="font-medium">${totals.creditEarned.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-orange-600">
              <span>Support Fund Items:</span>
              <span className="font-medium">${totals.supportFundSubtotal.toFixed(2)}</span>
            </div>
            <div className="border-t pt-2">
              <div className="flex justify-between">
                <span className="text-lg font-semibold">Total Order Value:</span>
                <span className="text-lg font-semibold">${totals.total.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
