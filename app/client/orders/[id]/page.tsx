'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import ClientLayout from '../../../components/ClientLayout';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  po_number: string;
  packing_slip_generated?: boolean;
  packing_slip_generated_at?: string;
  packing_slip_generated_by?: string;
  company?: {
    company_name: string;
    netsuite_number: string;
    ship_to?: string;
    support_fund?: { percent: number }[];
    incoterm?: { name: string };
    payment_term?: { name: string };
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item?: boolean;
  product?: {
    item_name: string;
    sku: string;
    price_international: number;
    price_americas: number;
    qualifies_for_credit_earning?: boolean;
  };
}

const statusBadgeClasses = (status: string) =>
  status === 'Open' ? 'bg-gray-200 text-gray-800' :
  status === 'In Process' ? 'bg-blue-100 text-blue-800' :
  status === 'Ready' ? 'bg-orange-100 text-orange-800' :
  status === 'Done' ? 'bg-green-100 text-green-800' :
  status === 'Cancelled' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';

export default function ClientOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [showPackingSlipForm, setShowPackingSlipForm] = useState(false);
  const [packingSlipData, setPackingSlipData] = useState({
    invoiceNumber: '',
    shippingMethod: 'Air',
    netsuiteReference: '',
    notes: ''
  });

  useEffect(() => {
    if (orderId) {
      fetchCurrentUser();
      fetchOrder();
      fetchOrderItems();
    }
  }, [orderId]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clientData, error } = await supabase
        .from('clients')
        .select('name')
        .eq('id', user.id)
        .single();

      if (!error && clientData?.name) {
        setCurrentUserName(clientData.name);
      }
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  };

  const fetchOrder = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          packing_slip_generated,
          packing_slip_generated_at,
          packing_slip_generated_by,
          company:companies(
            company_name,
            netsuite_number,
            ship_to,
            support_fund:support_fund_levels(percent),
            incoterm:incoterms(name),
            payment_term:payment_terms(name)
          )
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setOrder(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async () => {
    try {
      console.log('Fetching order items for order:', orderId);
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(item_name, sku, price_international, price_americas, qualifies_for_credit_earning)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('id', { ascending: true });

      if (error) {
        console.error('Order items query error:', error);
        throw error;
      }
      
      console.log('Order items fetched:', data?.length || 0, 'items');
      console.log('Order items data:', data);
      
      // Debug support fund items
      const supportFundItems = data?.filter(item => item.is_support_fund_item) || [];
      const regularItems = data?.filter(item => !item.is_support_fund_item) || [];
      console.log('Support fund items:', supportFundItems.length, supportFundItems);
      console.log('Regular items:', regularItems.length, regularItems);
      
      setOrderItems(data || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
      setError(`Failed to load order items: ${err.message}`);
    }
  };

  const handleGeneratePackingSlip = async () => {
    try {
      if (!order || !orderItems.length) {
        setError('No order data available for packing slip generation');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Save packing slip data to database
      const { data: packingSlipRecord, error: packingSlipError } = await supabase
        .from('packing_slips')
        .insert({
          order_id: orderId,
          invoice_number: packingSlipData.invoiceNumber,
          shipping_method: packingSlipData.shippingMethod,
          netsuite_reference: packingSlipData.netsuiteReference,
          notes: packingSlipData.notes,
          created_by: user.id
        })
        .select()
        .single();

      if (packingSlipError) throw packingSlipError;

      // Update order to mark packing slip as generated
      const { error: orderUpdateError } = await supabase
        .from('orders')
        .update({
          packing_slip_generated: true,
          packing_slip_generated_at: new Date().toISOString(),
          packing_slip_generated_by: user.id
        })
        .eq('id', orderId);

      if (orderUpdateError) throw orderUpdateError;

      // Refresh order data
      await fetchOrder();
      
      // Close the modal
      setShowPackingSlipForm(false);

      // Redirect to packing slip view page
      window.location.href = `/client/orders/${orderId}/packing-slip`;
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading order...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error || !order) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The order you are looking for does not exist.'}</p>
          <Link
            href="/client/orders"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Orders
          </Link>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Order Summary</h1>
            {order?.company?.company_name && (
              <h2 className="text-lg font-medium text-gray-700 mt-1">{order.company.company_name}</h2>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {order?.status === 'Open' && (
              <Link
                href={`/client/orders/${orderId}/edit`}
                className="bg-black text-white px-4 py-2 hover:opacity-90 transition text-sm"
              >
                Edit Order
              </Link>
            )}
            {order?.status !== 'Open' && order?.status !== 'Cancelled' && (
              order?.packing_slip_generated ? (
                <Link
                  href={`/client/orders/${orderId}/packing-slip`}
                  className="px-4 py-2 transition text-sm bg-gray-600 text-white hover:bg-gray-700"
                >
                  Packing Slip
                </Link>
              ) : (
                <button
                  onClick={() => setShowPackingSlipForm(true)}
                  className="px-4 py-2 transition text-sm bg-purple-600 text-white hover:bg-purple-700"
                >
                  Generate Packing Slip
                </button>
              )
            )}
            <Link
              href="/client/orders"
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back to Orders
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
          {/* Left Block: Order Information */}
          <Card header={<h2 className="font-semibold">Order Information</h2>}>
            <div className="px-6 space-y-2">
              <div>
                <label className="text-sm font-medium text-gray-500">PO Number</label>
                <p className="text-lg font-mono">{order.po_number || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="mt-1">
                  <span className={`inline-flex items-center rounded px-2 py-1 text-[10px] font-bold tracking-wide uppercase ${statusBadgeClasses(order.status)}`}>
                    {order.status}
                  </span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-sm text-gray-600">
                  {new Date(order.created_at).toLocaleString()}
                  {currentUserName && ` by ${currentUserName}`}
                </p>
              </div>
            </div>
          </Card>

          {/* Middle Block: Bill To */}
          <Card header={<h2 className="font-semibold">Bill To</h2>}>
            <div className="px-6 space-y-2">
              <div>
                <label className="text-sm font-medium text-gray-500">Company</label>
                <p className="text-lg">{order.company?.company_name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Ship To</label>
                <div className="text-sm text-gray-700 whitespace-pre-line">
                  {order.company?.ship_to || 'Not specified'}
                </div>
              </div>
            </div>
          </Card>

          {/* Right Block: Order Summary */}
          <Card header={<h2 className="font-semibold">Order Summary</h2>}>
            <div className="px-6 space-y-2">
              <div>
                <label className="text-sm font-medium text-gray-500">Total Order</label>
                <p className="text-lg font-semibold">${order.total_value?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Credit Earned</label>
                <p className="text-lg text-green-600 font-semibold">
                  ${order.credit_earned?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Incoterm</label>
                  <p className="text-sm text-gray-600">{order.company?.incoterm?.name || 'Not specified'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment Terms</label>
                  <p className="text-sm text-gray-600">{order.company?.payment_term?.name || 'Not specified'}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Order Items */}
        <Card header={<h2 className="font-semibold">Items</h2>}>
          <div className="px-6 overflow-x-auto">
            <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
              <thead>
                <tr className="border-b border-[#e5e5e5]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quantity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Unit Price</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Price</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product?.item_name || 'N/A'}
                        </div>
                        {item.is_support_fund_item && (
                          <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Support Fund</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.product?.sku || 'N/A'}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm ${item.is_support_fund_item ? 'text-green-700 font-medium' : 'text-gray-900'}`}>${item.unit_price?.toFixed(2) || '0.00'}</td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${item.is_support_fund_item ? 'text-green-700' : 'text-gray-900'}`}>${item.total_price?.toFixed(2) || '0.00'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orderItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No items found for this order.</p>
              {order?.status === 'Open' && (
                <p className="text-sm mt-2">
                  <Link
                    href={`/client/orders/${orderId}/edit`}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Edit this order
                  </Link>
                  {' '}to add items.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Order Totals */}
        <Card header={<h2 className="font-semibold">Totals</h2>}>
          <div className="px-6 space-y-1">
            {(() => {
              // Calculate breakdown
              const regularItems = orderItems.filter(item => !item.is_support_fund_item);
              const supportFundItems = orderItems.filter(item => item.is_support_fund_item);
              const regularSubtotal = regularItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
              const supportFundItemsTotal = supportFundItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
              
              // Use database values instead of recalculating
              const creditUsed = order.support_fund_used || 0;
              const totalOrderValue = order.total_value || 0;
              
              // Only calculate the balance
              const balance = creditUsed - supportFundItemsTotal;
              
              return (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Regular Items:</span>
                    <span className="text-sm font-medium">${regularSubtotal.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-green-600">
                    <span className="text-sm">Credit Used:</span>
                    <span className="text-sm font-medium">${creditUsed.toFixed(2)}</span>
                  </div>

                  <div className="flex justify-between text-orange-600">
                    <span className="text-sm">Balance:</span>
                    <span className="text-sm font-medium">${balance.toFixed(2)}</span>
                  </div>

                  <div className="border-t pt-2">
                    <div className="flex justify-between">
                      <span className="text-lg font-semibold">Total Order Value:</span>
                      <span className="text-lg font-semibold">${totalOrderValue.toFixed(2)}</span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </Card>

        {/* Packing Slip Form Modal */}
        {showPackingSlipForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Generate Packing Slip</h2>
                <button
                  onClick={() => setShowPackingSlipForm(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="space-y-6">
                {/* Invoice Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Invoice Number *
                  </label>
                  <input
                    type="text"
                    value={packingSlipData.invoiceNumber}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter invoice number"
                    required
                  />
                </div>

                {/* Shipping Method */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Shipping Method *
                  </label>
                  <select
                    value={packingSlipData.shippingMethod}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, shippingMethod: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="Air">Air</option>
                    <option value="Ocean">Ocean</option>
                  </select>
                </div>

                {/* Sales Order Reference */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sales Order Reference
                  </label>
                  <input
                    type="text"
                    value={packingSlipData.netsuiteReference}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, netsuiteReference: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter sales order reference"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={packingSlipData.notes}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black h-24"
                    placeholder="Enter any additional notes for the packing slip"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowPackingSlipForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!packingSlipData.invoiceNumber) {
                      alert('Please fill in the Invoice Number');
                      return;
                    }
                    if (!order?.company?.ship_to) {
                      alert('Company Ship To Address is not configured. Please update the company information first.');
                      return;
                    }
                    handleGeneratePackingSlip();
                  }}
                  className="px-4 py-2 bg-purple-600 text-white hover:bg-purple-700 transition"
                >
                  Generate Packing Slip
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
