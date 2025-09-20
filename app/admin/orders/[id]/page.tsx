'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
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
  client?: {
    name: string;
    email: string;
  };
  company?: {
    company_name: string;
    netsuite_number: string;
    ship_to?: string;
    support_fund?: { percent: number };
    subsidiary?: { name: string };
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
  const [showPackingListForm, setShowPackingListForm] = useState(false);
  const [packingListData, setPackingListData] = useState({
    invoiceNumber: '',
    shippingMethod: 'Air',
    netsuiteReference: '',
    notes: '',
    selectedCompany: 'Qiqi Global Ltd.',
    shipToAddress: ''
  });

  // Company addresses for packing list
  const companyAddresses = {
    'Qiqi Global Ltd.': {
      name: 'Qiqi Global Ltd.',
      address: '123 Global Street\nLondon, UK\nSW1A 1AA',
      phone: '+44 20 7123 4567',
      email: 'info@qiqi-global.com'
    },
    'Qiqi INC.': {
      name: 'Qiqi INC.',
      address: '456 Business Ave\nNew York, NY 10001\nUnited States',
      phone: '+1 555 123 4567',
      email: 'info@qiqi-inc.com'
    }
  };

  useEffect(() => {
    if (orderId) {
      fetchOrder();
      fetchOrderItems();
      fetchOrderHistory();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    try {
      // Fetch order first
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
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
            subsidiary:subsidiaries(name),
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

  const handleGeneratePackingListPDF = async () => {
    try {
      if (!order || !orderItems.length) {
        setError('No order data available for packing list generation');
        return;
      }

      // Generate PDF using browser's print functionality
      const pdfContent = generatePackingListHTML(order, orderItems, packingListData, companyAddresses);
      
      // Create a new window for printing
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setError('Unable to open print window. Please check your popup blocker.');
        return;
      }

      printWindow.document.write(pdfContent);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      // Close the modal
      setShowPackingListForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generatePackingListHTML = (order: Order, items: OrderItem[], data: any, companyAddresses: any): string => {
    const orderDate = new Date(order.created_at).toLocaleDateString();
    const companyName = order.company?.company_name || 'N/A';
    const selectedCompany = companyAddresses[data.selectedCompany];
    
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
          <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${product?.sku || 'N/A'}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: left;">${product?.item_name || 'N/A'}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${item.quantity}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${casePack}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${cases}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${caseWeight} kg</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${weight.toFixed(2)} kg</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${product?.hs_code || 'N/A'}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">${product?.made_in || 'N/A'}</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing List - ${order.po_number || orderId}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
          .header { text-align: center; margin-bottom: 30px; }
          .company-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .company-box { border: 2px solid #333; padding: 15px; width: 45%; }
          .order-info { margin-bottom: 30px; }
          .order-info table { width: 100%; border-collapse: collapse; }
          .order-info td { padding: 5px; border: 1px solid #ddd; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .items-table th { background-color: #f5f5f5; font-weight: bold; padding: 10px; border: 1px solid #ddd; text-align: center; }
          .totals { text-align: right; margin-top: 20px; }
          .notes { margin-top: 30px; }
          .signature { margin-top: 50px; display: flex; justify-content: space-between; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>PACKING LIST</h1>
          <h2>Invoice #: ${data.invoiceNumber}</h2>
        </div>

        <div class="company-info">
          <div class="company-box">
            <h3>FROM:</h3>
            <div><strong>${selectedCompany.name}</strong></div>
            <div style="white-space: pre-line;">${selectedCompany.address}</div>
            <div>Phone: ${selectedCompany.phone}</div>
            <div>Email: ${selectedCompany.email}</div>
          </div>
          
          <div class="company-box">
            <h3>SHIP TO:</h3>
            <div><strong>${companyName}</strong></div>
            <div style="white-space: pre-line;">${data.shipToAddress}</div>
          </div>
        </div>

        <div class="order-info">
          <table>
            <tr>
              <td><strong>PO Number:</strong></td>
              <td>${order.po_number || orderId}</td>
              <td><strong>Order Date:</strong></td>
              <td>${orderDate}</td>
            </tr>
            <tr>
              <td><strong>Shipping Method:</strong></td>
              <td>${data.shippingMethod}</td>
              <td><strong>NetSuite Reference:</strong></td>
              <td>${data.netsuiteReference || 'N/A'}</td>
            </tr>
          </table>
        </div>

        <table class="items-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product Name</th>
              <th>Quantity</th>
              <th>Case Pack</th>
              <th>Cases</th>
              <th>Case Weight</th>
              <th>Total Weight</th>
              <th>HS Code</th>
              <th>Made In</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHTML}
          </tbody>
        </table>

        <div class="totals">
          <table style="margin-left: auto;">
            <tr>
              <td style="padding: 5px; text-align: right;"><strong>Total Cases:</strong></td>
              <td style="padding: 5px; text-align: center;"><strong>${totalCases}</strong></td>
            </tr>
            <tr>
              <td style="padding: 5px; text-align: right;"><strong>Total Weight:</strong></td>
              <td style="padding: 5px; text-align: center;"><strong>${totalWeight.toFixed(2)} kg</strong></td>
            </tr>
          </table>
        </div>

        ${data.notes ? `
        <div class="notes">
          <h3>Notes:</h3>
          <div style="border: 1px solid #ddd; padding: 15px; min-height: 50px;">
            ${data.notes.replace(/\n/g, '<br>')}
          </div>
        </div>
        ` : ''}

        <div class="signature">
          <div>
            <div style="border-top: 1px solid #333; width: 200px; margin-top: 50px;">
              <div style="text-align: center;">Shipper Signature</div>
            </div>
          </div>
          <div>
            <div style="border-top: 1px solid #333; width: 200px; margin-top: 50px;">
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
      <div className="p-6" style={{ backgroundColor: 'rgb(250, 250, 250)', minHeight: '100vh' }}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Order Details</h1>
          <div className="flex space-x-2">
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
            <button
              onClick={() => setShowPackingListForm(true)}
              className="bg-purple-600 text-white px-4 py-2 hover:bg-purple-700 transition"
            >
              Packing List
            </button>
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
          <div className="bg-white p-6 border border-gray-300">
            <h2 className="text-lg font-semibold mb-4">Order Information</h2>
            <div className="space-y-3">
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
                    className={`px-3 py-1 border-0 focus:ring-2 focus:ring-black ${
                      statusOptions.find(s => s.value === order.status)?.color || 'bg-gray-100 text-gray-800'
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
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-lg">{new Date(order.created_at).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Client Name</label>
                <p className="text-lg">{order.client?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <p className="text-lg">{order.client?.email || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Middle Block: Bill To */}
          <div className="bg-white p-6 border border-gray-300">
            <h2 className="text-lg font-semibold mb-4">Bill To</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Company</label>
                <p className="text-lg">{order.company?.company_name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">NetSuite Number</label>
                <p className="text-lg">{order.company?.netsuite_number || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Ship To</label>
                <div className="text-sm text-gray-700 whitespace-pre-line">
                  {order.company?.ship_to || 'Not specified'}
                </div>
              </div>
            </div>
          </div>

          {/* Right Block: Order Summary */}
          <div className="bg-white p-6 border border-gray-300">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
            <div className="space-y-3">
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
        </div>

        {/* Order Items */}
        <div className="mt-6 bg-white border border-gray-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold">Order Items</h2>
            <div className="flex items-center space-x-4">
              {isReordering && (
                <span className="text-sm text-blue-600 font-medium">
                  Drag and drop rows to reorder products
                </span>
              )}
              <button
                onClick={() => setIsReordering(!isReordering)}
                className={`px-4 py-2 text-sm font-medium transition ${
                  isReordering 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {isReordering ? 'Done Reordering' : 'Reorder Products'}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto" style={{ backgroundColor: 'rgb(250, 250, 250)' }}>
            <table className="w-full">
              <thead style={{ backgroundColor: 'transparent' }}>
                <tr>
                  {isReordering && (
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                      Order
                    </th>
                  )}
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU
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
                </tr>
              </thead>
              <tbody className="bg-white border" style={{ borderColor: 'rgb(230, 230, 230)' }}>
                {orderItems.map((item, index) => (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-gray-50 border-b border-solid ${item.is_support_fund_item ? 'bg-green-50' : ''} ${
                      isReordering ? 'cursor-move' : ''
                    } ${draggedItem === item.id ? 'opacity-50' : ''}`}
                    style={{ borderColor: 'rgb(230, 230, 230)' }}
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="text-sm font-medium text-gray-900">
                          {item.product?.item_name || 'N/A'}
                        </div>
                        {item.is_support_fund_item && (
                          <span className="ml-2 inline-flex items-center px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800">
                            Support Fund
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.product?.sku || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.quantity}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${item.is_support_fund_item ? 'text-green-700 font-medium' : 'text-gray-900'}`}>
                      ${item.unit_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${item.is_support_fund_item ? 'text-green-700' : 'text-gray-900'}`}>
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
        </div>

        {/* Order History */}
        <div className="mt-6 bg-white border border-gray-300 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Order History & Activity</h2>
          </div>
          <div className="p-6">
            {orderHistory.length > 0 ? (
              <div className="space-y-4">
                {orderHistory.map((historyItem) => (
                  <div key={historyItem.id} className="flex items-start space-x-3 pb-4 border-b border-gray-100 last:border-b-0">
                    <div className="flex-shrink-0 w-2 h-2 bg-blue-500 mt-2"></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        {historyItem.status_from && historyItem.status_to ? (
                          <span className="text-sm font-medium text-gray-900">
                            Status changed from <span className="px-2 py-1 bg-gray-100 text-xs">{historyItem.status_from}</span> to <span className="px-2 py-1 bg-green-100 text-green-800 text-xs">{historyItem.status_to}</span>
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
                          <span className="px-2 py-1 bg-orange-100 text-orange-800">
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
          </div>
        </div>

        {/* Order Summary for Admin */}
        <div className="mt-6 bg-white border border-gray-300 p-6">
          <h2 className="text-lg font-semibold mb-4">Order Financial Summary</h2>
          <div className="space-y-2">
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
        </div>

        {/* Packing List Form Modal */}
        {showPackingListForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Generate Packing List</h2>
                <button
                  onClick={() => setShowPackingListForm(false)}
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
                    value={packingListData.invoiceNumber}
                    onChange={(e) => setPackingListData(prev => ({ ...prev, invoiceNumber: e.target.value }))}
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
                    value={packingListData.shippingMethod}
                    onChange={(e) => setPackingListData(prev => ({ ...prev, shippingMethod: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="Air">Air</option>
                    <option value="Ocean">Ocean</option>
                  </select>
                </div>

                {/* NetSuite Reference */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    NetSuite Sales Order Reference
                  </label>
                  <input
                    type="text"
                    value={packingListData.netsuiteReference}
                    onChange={(e) => setPackingListData(prev => ({ ...prev, netsuiteReference: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                    placeholder="Enter NetSuite sales order reference"
                  />
                </div>

                {/* Company Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Company *
                  </label>
                  <select
                    value={packingListData.selectedCompany}
                    onChange={(e) => setPackingListData(prev => ({ ...prev, selectedCompany: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="Qiqi Global Ltd.">Qiqi Global Ltd.</option>
                    <option value="Qiqi INC.">Qiqi INC.</option>
                  </select>
                </div>

                {/* Ship To Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ship To Address *
                  </label>
                  <textarea
                    value={packingListData.shipToAddress || order?.company?.ship_to || ''}
                    onChange={(e) => setPackingListData(prev => ({ ...prev, shipToAddress: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black h-24"
                    placeholder="Enter shipping address"
                    required
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    value={packingListData.notes}
                    onChange={(e) => setPackingListData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black h-24"
                    placeholder="Enter any additional notes for the packing list"
                  />
                </div>

                {/* Preview Selected Company */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    From Company Details:
                  </label>
                  <div className="bg-gray-50 p-4 border border-gray-300">
                    <div className="font-medium">{companyAddresses[packingListData.selectedCompany as keyof typeof companyAddresses].name}</div>
                    <div className="text-sm text-gray-700 whitespace-pre-line">
                      {companyAddresses[packingListData.selectedCompany as keyof typeof companyAddresses].address}
                    </div>
                    <div className="text-sm text-gray-600">
                      Phone: {companyAddresses[packingListData.selectedCompany as keyof typeof companyAddresses].phone}
                    </div>
                    <div className="text-sm text-gray-600">
                      Email: {companyAddresses[packingListData.selectedCompany as keyof typeof companyAddresses].email}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowPackingListForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (!packingListData.invoiceNumber || !packingListData.shipToAddress) {
                      alert('Please fill in all required fields (Invoice Number and Ship To Address)');
                      return;
                    }
                    handleGeneratePackingListPDF();
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
