'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  user_id: string;
  company_id: string;
  po_number: string;
  invoice_number?: string | null;
  so_number?: string | null;
  packing_slip_generated?: boolean;
  packing_slip_generated_at?: string;
  packing_slip_generated_by?: string;
  client?: {
    name: string;
    email: string;
  };
  company?: {
    company_name: string;
    netsuite_number: string;
    ship_to?: string;
    support_fund?: { percent: number };
    subsidiary?: { 
      name: string;
      ship_from_address?: string;
      company_address?: string;
      phone?: string;
      email?: string;
    };
    class?: { name: string };
    location?: { location_name: string };
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
  sort_order?: number;
  product?: {
    item_name: string;
    sku: string;
    price_international: number;
    price_americas: number;
    qualifies_for_credit_earning?: boolean;
    case_pack?: number;
    case_weight?: number;
    hs_code?: string;
    made_in?: string;
  };
}

interface OrderHistory {
  id: string;
  order_id: string;
  status_from: string | null;
  status_to: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_role: string | null;
  notes: string | null;
  netsuite_sync_status: string | null;
  created_at: string;
}

const statusOptions = [
  { value: 'Open', label: 'Open', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'In Process', label: 'In Process', color: 'bg-blue-100 text-blue-800' },
  { value: 'Ready', label: 'Ready', color: 'bg-orange-100 text-orange-800' },
  { value: 'Done', label: 'Done', color: 'bg-green-100 text-green-800' },
  { value: 'Cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
];

export default function OrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isReordering, setIsReordering] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [showPackingSlipForm, setShowPackingSlipForm] = useState(false);
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [packingSlipData, setPackingSlipData] = useState({
    invoiceNumber: '',
    shippingMethod: 'Air',
    netsuiteReference: '',
    notes: ''
  });
  const [packingSlipGenerated, setPackingSlipGenerated] = useState(false);
  const [adminInvoiceNumber, setAdminInvoiceNumber] = useState<string>('');
  const [adminSoNumber, setAdminSoNumber] = useState<string>('');
  const [savingAdminFields, setSavingAdminFields] = useState<boolean>(false);


  useEffect(() => {
    if (orderId) {
      fetchCurrentUser();
      fetchOrder();
      fetchOrderItems();
      fetchOrderHistory();
    }
  }, [orderId]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: adminData, error } = await supabase
        .from('admins')
        .select('name')
        .eq('id', user.id)
        .single();

      if (!error && adminData?.name) {
        setCurrentUserName(adminData.name);
      }
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  };

  const fetchOrder = async () => {
    try {
      // Fetch order first
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*, packing_slip_generated, packing_slip_generated_at, packing_slip_generated_by, invoice_number, so_number')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch related data separately
      const [clientResult, companyResult] = await Promise.all([
        supabase
          .from('clients')
          .select('name, email')
          .eq('id', orderData.user_id)
          .single(),
        orderData.company_id ? supabase
          .from('companies')
          .select(`
            company_name,
            netsuite_number,
            ship_to,
            support_fund:support_fund_levels(percent),
            subsidiary:subsidiaries(name, ship_from_address, company_address, phone, email),
            class:classes(name),
            location:Locations(location_name),
            incoterm:incoterms(name),
            payment_term:payment_terms(name)
          `)
          .eq('id', orderData.company_id)
          .single() : { data: null, error: null }
      ]);

      // Combine data
      const combinedOrder = {
        ...orderData,
        client: clientResult.data,
        company: companyResult.data
      };

      setOrder(combinedOrder);
      setAdminInvoiceNumber(orderData.invoice_number || '');
      setAdminSoNumber(orderData.so_number || '');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAdminOrderRefs = async () => {
    if (!order) return;
    try {
      setSavingAdminFields(true);
      const { error } = await supabase
        .from('orders')
        .update({ invoice_number: adminInvoiceNumber || null, so_number: adminSoNumber || null })
        .eq('id', orderId);
      if (error) throw error;
      setOrder(prev => prev ? { ...prev, invoice_number: adminInvoiceNumber || null, so_number: adminSoNumber || null } as Order : prev);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingAdminFields(false);
    }
  };

  const fetchOrderItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(item_name, sku, price_international, price_americas, qualifies_for_credit_earning, case_pack, case_weight, hs_code, made_in)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
    }
  };

  const fetchOrderHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOrderHistory(data || []);
    } catch (err: any) {
      console.error('Error fetching order history:', err);
    }
  };

  const handleReorderProducts = async (newOrder: OrderItem[]) => {
    try {
      // Update sort_order for each item
      const updates = newOrder.map((item, index) => 
        supabase
          .from('order_items')
          .update({ sort_order: index })
          .eq('id', item.id)
      );

      await Promise.all(updates);
      
      // Refresh order items
      await fetchOrderItems();
      
    } catch (err: any) {
      console.error('Error reordering products:', err);
      setError('Failed to reorder products. Please try again.');
    }
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    const newItems = [...orderItems];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);
    setOrderItems(newItems);
    return newItems;
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetItemId) {
      setDraggedItem(null);
      return;
    }

    const fromIndex = orderItems.findIndex(item => item.id === draggedItem);
    const toIndex = orderItems.findIndex(item => item.id === targetItemId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const newOrder = moveItem(fromIndex, toIndex);
      handleReorderProducts(newOrder);
    }

    setDraggedItem(null);
  };

  const handleStatusChange = async (newStatus: string) => {
    if (!order) return;

    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', orderId);

      if (error) throw error;
      setOrder(prev => prev ? { ...prev, status: newStatus } : null);
      
      // Refresh order history to show the new status change
      fetchOrderHistory();
      
      // Send notification if status changed to certain states
      if (['In Process', 'Done'].includes(newStatus)) {
        await sendNotification('status_change');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const sendNotification = async (type: string, customMessage?: string) => {
    if (!order) return;
    
    setSendingNotification(true);
    try {
      const response = await fetch('/api/orders/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.id,
          type,
          customMessage
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh history to show notification sent
        fetchOrderHistory();
      } else {
        console.error('Failed to send notification:', data.error);
      }
    } catch (err: any) {
      console.error('Error sending notification:', err);
    } finally {
      setSendingNotification(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      // For now, we'll just show an alert. We'll implement actual CSV generation later
      alert(`CSV download for order ${orderId} will be implemented in the next step.`);
    } catch (err: any) {
      setError(err.message);
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
      console.log('Creating packing slip with data:', {
        order_id: orderId,
        invoice_number: packingSlipData.invoiceNumber,
        shipping_method: packingSlipData.shippingMethod,
        netsuite_reference: packingSlipData.netsuiteReference,
        notes: packingSlipData.notes,
        created_by: user.id
      });

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

      if (packingSlipError) {
        console.error('Packing slip creation error:', packingSlipError);
        throw packingSlipError;
      }

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
      window.location.href = `/admin/orders/${orderId}/packing-slip`;
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generatePackingListHTML = (order: Order, items: OrderItem[], data: any): string => {
    const orderDate = new Date(order.created_at).toLocaleDateString();
    const companyName = order.company?.company_name || 'N/A';
    const subsidiary = order.company?.subsidiary;
    const packingListDate = new Date().toLocaleDateString();
    
    // Calculate totals
    let totalCases = 0;
    let totalWeight = 0;
    
    const itemsHTML = items.map((item) => {
      const product = item.product;
      const casePack = product?.case_pack || 1;
      const cases = Math.ceil(item.quantity / casePack);
      const caseWeight = product?.case_weight || 0;
      const weight = cases * caseWeight;
      
      totalCases += cases;
      totalWeight += weight;
      
      return `
        <tr>
          <td style="border: 1px solid #000; padding: 6px; text-align: left; font-size: 11px;">${product?.sku || 'N/A'}</td>
          <td style="border: 1px solid #000; padding: 6px; text-align: left; font-size: 11px;">${product?.item_name || 'N/A'}</td>
          <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 11px;">${item.quantity}</td>
          <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 11px;">${casePack}</td>
          <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 11px;">${cases}</td>
          <td style="border: 1px solid #000; padding: 6px; text-align: center; font-size: 11px;">${weight.toFixed(2)} kg</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing List - ${data.invoiceNumber}</title>
        <style>
          @page { size: A4 portrait; margin: 0.2in; }
          body { font-family: Arial, sans-serif; margin: 0; color: #333; font-size: 12px; }
          .top-section { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px; }
          .subsidiary-info { flex: 1; }
          .subsidiary-title { font-size: 24px; font-weight: bold; margin-bottom: 8px; }
          .subsidiary-address { font-size: 11px; margin-bottom: 4px; white-space: pre-line; }
          .subsidiary-contact { font-size: 11px; margin-bottom: 2px; }
          .logo-container { text-align: right; }
          .logo { width: 120px; height: auto; }
          .divider-line { border-top: 1px solid #000; margin: 15px 0; }
          .three-blocks { display: flex; justify-content: space-between; margin-bottom: 15px; }
          .block { flex: 1; margin: 0 10px; }
          .block-title { font-size: 11px; font-weight: bold; margin-bottom: 8px; }
          .block-content { font-size: 11px; }
          .packing-list-title { font-size: 16px; font-weight: bold; margin: 15px 0 5px 0; }
          .packing-list-divider { border-top: 1px solid #000; margin-bottom: 10px; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
          .items-table th { background-color: #f5f5f5; font-weight: bold; padding: 8px 6px; border: 1px solid #000; text-align: center; font-size: 11px; }
          .items-table td { border: 1px solid #000; padding: 6px; }
          .totals { text-align: right; margin-top: 15px; font-size: 11px; }
          .notes { margin-top: 20px; font-size: 11px; }
          .signature { margin-top: 30px; display: flex; justify-content: space-between; font-size: 11px; }
          @media print { 
            body { margin: 0; }
            .top-section { page-break-inside: avoid; }
            .three-blocks { page-break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <!-- Top Section: Subsidiary Info + Logo -->
        <div class="top-section">
          <div class="subsidiary-info">
            <div class="subsidiary-title">${subsidiary?.name || 'N/A'}</div>
            <div class="subsidiary-address">${subsidiary?.ship_from_address || 'Address not configured'}</div>
            ${subsidiary?.phone ? `<div class="subsidiary-contact">Phone: ${subsidiary.phone}</div>` : ''}
            ${subsidiary?.email ? `<div class="subsidiary-contact">Email: ${subsidiary.email}</div>` : ''}
          </div>
          <div class="logo-container">
            <img src="/QIQI-Logo.svg" alt="Qiqi Logo" class="logo" />
          </div>
        </div>

        <!-- First Divider Line -->
        <div class="divider-line"></div>

        <!-- Three Blocks Section -->
        <div class="three-blocks">
          <!-- Left Block: Ship To -->
          <div class="block">
            <div class="block-title">Ship To</div>
            <div class="block-content">
              <div><strong>${companyName}</strong></div>
              <div style="white-space: pre-line; margin-top: 4px;">${order.company?.ship_to || 'Ship To Address not configured'}</div>
            </div>
          </div>
          
          <!-- Middle Block: Empty for now -->
          <div class="block">
            <div class="block-content">Hello</div>
          </div>
          
          <!-- Right Block: Order Details -->
          <div class="block">
            <div class="block-content">
              <div style="margin-bottom: 4px;"><strong>Date:</strong> ${packingListDate}</div>
              <div style="margin-bottom: 4px;"><strong>Destination Country:</strong> [To be added]</div>
              <div style="margin-bottom: 4px;"><strong>Invoice number:</strong> ${data.invoiceNumber}</div>
              <div style="margin-bottom: 4px;"><strong>Method:</strong> ${data.shippingMethod}</div>
              <div style="margin-bottom: 4px;"><strong>Reference:</strong> ${data.netsuiteReference || 'N/A'}</div>
            </div>
          </div>
        </div>

        <!-- Second Divider Line -->
        <div class="divider-line"></div>

        <!-- Packing List Title -->
        <div class="packing-list-title">Packing List</div>
        <div class="packing-list-divider"></div>

        <!-- Items Table -->
        <table class="items-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product Name</th>
              <th>Total Units</th>
              <th>Case Pack</th>
              <th>Cases</th>
              <th>Total Weight</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <table style="margin-left: auto;">
            <tr>
              <td style="padding: 3px 8px; text-align: right;"><strong>Total Cases:</strong></td>
              <td style="padding: 3px 8px; text-align: center;"><strong>${totalCases}</strong></td>
            </tr>
            <tr>
              <td style="padding: 3px 8px; text-align: right;"><strong>Total Weight:</strong></td>
              <td style="padding: 3px 8px; text-align: center;"><strong>${totalWeight.toFixed(2)} kg</strong></td>
            </tr>
          </table>
        </div>

        ${data.notes ? `
        <div class="notes">
          <h3>Notes:</h3>
          <div style="border: 1px solid #ddd; padding: 10px; min-height: 40px;">
            ${data.notes.replace(/\n/g, '<br>')}
          </div>
        </div>
        ` : ''}

        <div class="signature">
          <div>
            <div style="border-top: 1px solid #333; width: 180px; margin-top: 30px;">
              <div style="text-align: center;">Shipper Signature</div>
            </div>
          </div>
          <div>
            <div style="border-top: 1px solid #333; width: 180px; margin-top: 30px;">
              <div style="text-align: center;">Date</div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading order...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !order) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The order you are looking for does not exist.'}</p>
            <Link
              href="/admin/orders"
              className="bg-black text-white px-4 py-2 hover:opacity-90 transition"
            >
              Back to Orders
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8 pb-16">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Order Details</h1>
          <div className="flex space-x-2">
            <Link
              href={`/admin/orders/${orderId}/edit`}
              className="bg-black text-white px-4 py-2 hover:opacity-90 transition"
            >
              Edit Order
            </Link>
            <button
              onClick={() => sendNotification('status_change', 'Order status updated by admin')}
              disabled={sendingNotification}
              className="bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 transition disabled:opacity-50"
            >
              {sendingNotification ? 'Sending...' : 'Send Update'}
            </button>
            <button
              onClick={handleDownloadCSV}
              className="bg-green-600 text-white px-4 py-2 hover:bg-green-700 transition"
            >
              Download CSV
            </button>
            {order.status !== 'Open' && order.status !== 'Cancelled' && (
              <Link
                href={order.packing_slip_generated ? `/admin/orders/${orderId}/packing-slip` : '#'}
                onClick={!order.packing_slip_generated ? () => setShowPackingSlipForm(true) : undefined}
                className={`px-4 py-2 transition ${
                  order.packing_slip_generated 
                    ? 'bg-gray-600 text-white hover:bg-gray-700' 
                    : 'bg-purple-600 text-white hover:bg-purple-700'
                }`}
              >
                {order.packing_slip_generated ? 'Packing Slip' : 'Generate Packing Slip'}
              </Link>
            )}
            <Link
              href="/admin/orders"
              className="bg-gray-300 text-gray-700 px-4 py-2 hover:bg-gray-400 transition"
            >
              Back to Orders
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Block: Order Information */}
          <Card header={<h2 className="text-lg font-semibold">Order Information</h2>}>
            <div className="space-y-2 px-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">PO Number</label>
                  <p className="text-lg font-mono">{order.po_number || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Status</label>
                  <div className="mt-1">
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      className={`px-3 py-1 border border-[#e5e5e5] rounded text-sm ${
                        order.status === 'Open'
                          ? 'bg-gray-200 text-gray-800'
                          : order.status === 'In Process'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'Ready'
                          ? 'bg-orange-100 text-orange-800'
                          : order.status === 'Done'
                          ? 'bg-green-100 text-green-800'
                          : order.status === 'Cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {/* Admin-only: Invoice/SO Numbers */}
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-gray-500">Invoice Number</label>
                  <input
                    type="text"
                    value={adminInvoiceNumber}
                    onChange={(e) => setAdminInvoiceNumber(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#e5e5e5] text-sm"
                    placeholder="Enter invoice number"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">SO Number</label>
                  <input
                    type="text"
                    value={adminSoNumber}
                    onChange={(e) => setAdminSoNumber(e.target.value)}
                    className="mt-1 w-full px-3 py-2 border border-[#e5e5e5] text-sm"
                    placeholder="Enter SO number"
                  />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveAdminOrderRefs}
                  disabled={savingAdminFields}
                  className="px-3 py-1.5 bg-black text-white text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {savingAdminFields ? 'Saving…' : 'Save'}
                </button>
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
          <Card header={<h2 className="text-lg font-semibold">Bill To</h2>}>
            <div className="space-y-2 px-6">
              <div>
                <label className="text-sm font-medium text-gray-500">Company</label>
                <p className="text-lg">
                  {order.company?.netsuite_number && `[${order.company.netsuite_number}] `}
                  {order.company?.company_name || 'N/A'}
                </p>
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
          <Card header={<h2 className="text-lg font-semibold">Order Summary</h2>}>
            <div className="space-y-2 px-6">
              <div>
                <label className="text-sm font-medium text-gray-500">Total Order</label>
                <p className="text-lg font-semibold">${order.total_value?.toFixed(2) || '0.00'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Credit Earned</label>
                <p className="text-lg font-semibold text-green-600">
                  ${order.credit_earned?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Incoterm</label>
                  <p className="text-lg">{order.company?.incoterm?.name || 'Not specified'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Payment Terms</label>
                  <p className="text-lg">{order.company?.payment_term?.name || 'Not specified'}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Order Items */}
        <Card header={
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Items</h2>
            <div className="flex items-center space-x-4">
              {isReordering && (
                <span className="text-sm text-blue-600 font-medium">
                  Drag and drop rows to reorder products
                </span>
              )}
              <button
                onClick={() => setIsReordering(!isReordering)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition ${
                  isReordering 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {isReordering ? 'Done Reordering' : 'Reorder Products'}
              </button>
            </div>
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[#e5e5e5]">
              <thead>
                <tr className="border-b border-[#e5e5e5]">
                  {isReordering && (
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider w-12">
                      Order
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    SKU
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                    Total Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item, index) => (
                  <tr
                    key={item.id} 
                    className={`hover:bg-gray-50 border-b border-[#e5e5e5] ${item.is_support_fund_item ? 'bg-green-50' : ''} ${
                      isReordering ? 'cursor-move' : ''
                    } ${draggedItem === item.id ? 'opacity-50' : ''}`}
                    draggable={isReordering}
                    onDragStart={(e) => handleDragStart(e, item.id)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, item.id)}
                  >
                    {isReordering && (
                      <td className="px-3 py-4 text-center">
                        <div className="flex items-center justify-center">
                          <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M7 2a1 1 0 011 1v2h4V3a1 1 0 112 0v2h2a1 1 0 110 2h-2v4h2a1 1 0 110 2h-2v2a1 1 0 11-2 0v-2H8v2a1 1 0 11-2 0v-2H4a1 1 0 110-2h2V7H4a1 1 0 110-2h2V3a1 1 0 011-1z"/>
                          </svg>
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product?.item_name || 'N/A'}
                        </div>
                        {item.is_support_fund_item && (
                          <span className="ml-2 inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">
                            Support Fund
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {item.product?.sku || 'N/A'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm ${item.is_support_fund_item ? 'text-green-700 font-medium' : 'text-gray-900'}`}>
                      ${item.unit_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${item.is_support_fund_item ? 'text-green-700' : 'text-gray-900'}`}>
                      ${item.total_price?.toFixed(2) || '0.00'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orderItems.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <p>No items found for this order.</p>
            </div>
          )}
        </Card>

        {/* Order History */}
        <Card header={<h2 className="text-lg font-semibold">Order History & Activity</h2>}>
            {orderHistory.length > 0 ? (
              <div className="space-y-4">
                {orderHistory.map((historyItem) => (
                <div key={historyItem.id} className="flex items-start space-x-3 pb-4 border-b border-[#e5e5e5] last:border-b-0">
                    <div className="flex-shrink-0 w-2 h-2 bg-blue-500 mt-2"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        {historyItem.status_from && historyItem.status_to ? (
                          <span className="text-sm font-medium text-gray-900">
                            Status changed from <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-gray-200 text-gray-800">{historyItem.status_from}</span> to <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">{historyItem.status_to}</span>
                          </span>
                        ) : (
                          <span className="text-sm font-medium text-gray-900">
                            {historyItem.notes || `Status set to ${historyItem.status_to}`}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <span>{new Date(historyItem.created_at).toLocaleString()}</span>
                        {historyItem.changed_by_name && (
                          <span>by {historyItem.changed_by_name} ({historyItem.changed_by_role})</span>
                        )}
                        {historyItem.netsuite_sync_status && (
                        <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800">
                            NetSuite: {historyItem.netsuite_sync_status}
                          </span>
                        )}
                      </div>
                      {historyItem.notes && historyItem.notes !== `Status set to ${historyItem.status_to}` && (
                        <div className="mt-1 text-sm text-gray-600 italic">
                          {historyItem.notes}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>No history available for this order.</p>
              </div>
            )}
        </Card>

        {/* Order Summary for Admin */}
        <Card header={<h2 className="text-lg font-semibold">Order Financial Summary</h2>}>
          <div className="space-y-1 px-6">
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
                  {/* Regular Items */}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Regular Items:</span>
                    <span className="font-medium">${regularSubtotal.toFixed(2)}</span>
                  </div>
                  
                  {/* Credit Used - always display */}
                  <div className="flex justify-between text-green-600">
                    <span>Credit Used:</span>
                    <span className="font-medium">${creditUsed.toFixed(2)}</span>
                  </div>
                  
                  {/* Balance - always display */}
                  <div className="flex justify-between text-orange-600">
                    <span>Balance:</span>
                    <span className="font-medium">${balance.toFixed(2)}</span>
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

        {/* Packing List Form Modal */}
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
                    placeholder="Enter any additional notes for the packing list"
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
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
