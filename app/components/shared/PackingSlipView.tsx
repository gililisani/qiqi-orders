'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../ui/Card';
import Link from 'next/link';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

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
    case_pack: number;
    case_weight: number;
    hs_code: string;
    made_in: string;
  };
}

interface PackingSlip {
  id: string;
  order_id: string;
  invoice_number: string;
  shipping_method: string;
  netsuite_reference?: string;
  notes?: string;
  created_at: string;
  created_by: string;
}

interface PackingSlipViewProps {
  role: 'admin' | 'client';
  backUrl: string;
}

export default function PackingSlipView({ role, backUrl }: PackingSlipViewProps) {
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packingSlip, setPackingSlip] = useState<PackingSlip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    invoice_number: '',
    shipping_method: '',
    netsuite_reference: '',
    notes: ''
  });

  const fetchOrderData = async () => {
    try {
      setLoading(true);
      setError(null);

      // For clients, first verify they can access this order
      if (role === 'client') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found');

        const { data: orderCheck, error: orderCheckError } = await supabase
          .from('orders')
          .select(`
            id,
            status,
            user_id,
            company:companies(
              id,
              clients!inner(id)
            )
          `)
          .eq('id', orderId)
          .eq('user_id', user.id)
          .single();

        if (orderCheckError || !orderCheck) {
          throw new Error('Order not found or access denied');
        }
      }

      // Fetch order details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          client:clients(name, email),
          company:companies(
            *,
            support_fund:support_fund_levels(percent),
            subsidiary:subsidiaries(*),
            class:classes(name),
            location:Locations(location_name),
            incoterm:incoterms(name),
            payment_term:payment_terms(name)
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;

      // Fetch order items
      const { data: itemsData, error: itemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(*)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('sort_order', { ascending: true });

      if (itemsError) throw itemsError;

      // Fetch packing slip
      const { data: packingSlipData, error: packingSlipError } = await supabase
        .from('packing_slips')
        .select('*')
        .eq('order_id', orderId)
        .single();

      if (packingSlipError && packingSlipError.code !== 'PGRST116') {
        throw packingSlipError;
      }

      // Fetch company data
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select(`
          *,
          subsidiary:subsidiaries(*)
        `)
        .eq('id', orderData.company_id)
        .single();

      if (companyError) throw companyError;

      const combinedOrder = {
        ...orderData,
        company: {
          ...orderData.company,
          ...companyData
        }
      };

      console.log(`${role} Packing Slip - Order Data:`, combinedOrder);
      console.log(`${role} Packing Slip - Company Data:`, companyData);
      console.log(`${role} Packing Slip - Subsidiary Data:`, companyData?.subsidiary);

      setOrder(combinedOrder);
      setOrderItems(itemsData || []);
      setPackingSlip(packingSlipData);

      // Set edit data if packing slip exists
      if (packingSlipData) {
        setEditData({
          invoice_number: packingSlipData.invoice_number,
          shipping_method: packingSlipData.shipping_method,
          netsuite_reference: packingSlipData.netsuite_reference || '',
          notes: packingSlipData.notes || ''
        });
      }

    } catch (err: any) {
      console.error('Error fetching order data:', err);
      setError(err.message || 'Failed to load order data');
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    const element = document.getElementById('packing-slip-content');
    if (!element) return;

    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      allowTaint: true
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    const imgWidth = 210;
    const pageHeight = 295;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;

    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft >= 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`packing-slip-${packingSlip?.invoice_number || 'invoice'}.pdf`);
  };

  const handleSave = async () => {
    if (!packingSlip) return;
    
    try {
      setSaving(true);
      const { error } = await supabase
        .from('packing_slips')
        .update({
          invoice_number: editData.invoice_number,
          shipping_method: editData.shipping_method,
          netsuite_reference: editData.netsuite_reference,
          notes: editData.notes
        })
        .eq('id', packingSlip?.id);

      if (error) throw error;

      // Refresh data
      await fetchOrderData();
      setEditMode(false);
    } catch (err: any) {
      console.error('Error saving packing slip:', err);
      setError(err.message || 'Failed to save packing slip');
    } finally {
      setSaving(false);
    }
  };

  const generatePackingSlipHTML = (order: Order, items: OrderItem[], packingSlip: PackingSlip): string => {
    const currentDate = new Date().toLocaleDateString();
    const itemsHTML = items.map(item => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.product?.item_name || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.product?.sku || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.product?.case_pack || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.product?.case_weight || 'N/A'} lbs</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.product?.hs_code || 'N/A'}</td>
        <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.product?.made_in || 'N/A'}</td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Packing Slip - ${packingSlip.invoice_number}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .invoice-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .company-info { display: flex; justify-content: space-between; margin-bottom: 30px; }
            .company-section { width: 45%; }
            .section-title { font-weight: bold; margin-bottom: 10px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            th { background-color: #f5f5f5; padding: 10px; text-align: left; border: 1px solid #ddd; }
            td { padding: 8px; border: 1px solid #ddd; }
            .notes { margin-top: 30px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="invoice-title">PACKING SLIP</div>
            <p>Date: ${currentDate}</p>
            <p>
              <strong>Invoice:</strong> ${packingSlip.invoice_number}<br>
              <strong>Method:</strong> ${packingSlip.shipping_method}<br>
              <strong>Reference:</strong> ${packingSlip.netsuite_reference || 'N/A'}
            </p>
          </div>

          <div class="company-info">
            <div class="company-section">
              <div class="section-title">Ship From:</div>
              <p>
                ${order.company?.subsidiary?.name || 'N/A'}<br>
                ${order.company?.subsidiary?.ship_from_address || 'N/A'}
              </p>
            </div>
            <div class="company-section">
              <div class="section-title">Ship To:</div>
              <p>
                ${order.company?.company_name || 'N/A'}<br>
                ${order.company?.ship_to || 'N/A'}
              </p>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Quantity</th>
                <th>Case Pack</th>
                <th>Weight</th>
                <th>HS Code</th>
                <th>Made In</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>

          ${packingSlip.notes ? `
          <div class="notes">
            <div class="section-title">Notes:</div>
            <p>${packingSlip.notes}</p>
          </div>
          ` : ''}

          <div class="footer">
            <p>Generated on ${currentDate}</p>
          </div>
        </body>
      </html>
    `;
  };

  useEffect(() => {
    if (orderId) {
      fetchOrderData();
    }
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading packing slip...</p>
        </div>
      </div>
    );
  }

  if (error || !order || !packingSlip) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Packing Slip Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The packing slip you are looking for does not exist.'}</p>
          <Link
            href={backUrl}
            className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            ← Back to Order
          </Link>
        </div>
      </div>
    );
  }

  // Check if user can edit (only if status is In Process, Ready, or Done)
  const canEdit = ['In Process', 'Ready', 'Done'].includes(order.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto py-8 px-4">
        <div className="mb-6">
          <Link
            href={backUrl}
            className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-4"
          >
            ← Back to Order
          </Link>
          <h1 className="text-2xl font-bold">Packing Slip</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Packing Slip Content */}
          <div className="lg:col-span-2">
            <Card>
              <div id="packing-slip-content" className="px-6 py-5 space-y-6">
                {/* Header */}
                <div className="text-center border-b pb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">PACKING SLIP</h2>
                  <p className="text-gray-600">Date: {new Date().toLocaleDateString()}</p>
                </div>

                {/* Invoice Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                    <div className="text-lg font-semibold text-gray-900">#{packingSlip.invoice_number}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Method</label>
                    <div className="text-lg font-semibold text-gray-900">{packingSlip.shipping_method}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NetSuite Reference</label>
                    <div className="text-lg font-semibold text-gray-900">{packingSlip.netsuite_reference || 'N/A'}</div>
                  </div>
                </div>

                {/* Company Information */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Ship From</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="font-medium">{order.company?.subsidiary?.name || 'N/A'}</p>
                      <p className="text-gray-600">{order.company?.subsidiary?.ship_from_address || 'N/A'}</p>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Ship To</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="font-medium">{order.company?.company_name || 'N/A'}</p>
                      <p className="text-gray-600">{order.company?.ship_to || 'N/A'}</p>
                    </div>
                  </div>
                </div>

                {/* Items Table */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">Items</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full bg-white border border-gray-200 rounded-lg">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SKU</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Case Pack</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Weight</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HS Code</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Made In</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {orderItems.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.product?.item_name || 'N/A'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.product?.sku || 'N/A'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.quantity}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.product?.case_pack || 'N/A'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.product?.case_weight || 'N/A'} lbs</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.product?.hs_code || 'N/A'}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{item.product?.made_in || 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Notes */}
                {packingSlip.notes && (
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Notes</h3>
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-700">{packingSlip.notes}</p>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Actions Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <div className="p-6 space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Actions</h2>
                
                <button
                  onClick={generatePDF}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download PDF
                </button>

                {canEdit && (
                  <>
                    <button
                      onClick={() => setEditMode(!editMode)}
                      className="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      {editMode ? 'Cancel Edit' : 'Edit Packing Slip'}
                    </button>
                  </>
                )}
              </div>
            </Card>

            {/* Edit Form */}
            {editMode && canEdit && (
              <Card>
                <div className="p-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">Edit Packing Slip</h2>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                      <input
                        type="text"
                        value={editData.invoice_number}
                        onChange={(e) => setEditData(prev => ({ ...prev, invoice_number: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter invoice number"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Shipping Method</label>
                      <input
                        type="text"
                        value={editData.shipping_method}
                        onChange={(e) => setEditData(prev => ({ ...prev, shipping_method: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter shipping method"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">NetSuite Reference</label>
                      <input
                        type="text"
                        value={editData.netsuite_reference}
                        onChange={(e) => setEditData(prev => ({ ...prev, netsuite_reference: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Enter NetSuite reference"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                      <textarea
                        value={editData.notes}
                        onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        rows={3}
                        placeholder="Enter any additional notes for the packing slip"
                      />
                    </div>

                    <div className="flex space-x-3">
                      <button
                        onClick={() => setEditMode(false)}
                        className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {saving ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
