'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import AdminLayout from '../../../../components/AdminLayout';
import Card from '../../../../components/ui/Card';
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
    case_pack?: number;
    case_weight?: number;
    hs_code?: string;
    made_in?: string;
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

export default function PackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packingSlip, setPackingSlip] = useState<PackingSlip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editData, setEditData] = useState({
    invoice_number: '',
    shipping_method: 'Air',
    netsuite_reference: '',
    notes: ''
  });

  useEffect(() => {
    if (orderId) {
      fetchData();
    }
  }, [orderId]);

  const fetchData = async () => {
    try {
      const [orderResult, itemsResult, packingSlipResult] = await Promise.all([
        // Fetch order
        supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single(),
        
        // Fetch order items
        supabase
          .from('order_items')
          .select(`
            *,
            product:Products(item_name, sku, price_international, price_americas, qualifies_for_credit_earning, case_pack, case_weight, hs_code, made_in)
          `)
          .eq('order_id', orderId)
          .order('is_support_fund_item', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true }),
        
        // Fetch packing slip
        supabase
          .from('packing_slips')
          .select('*')
          .eq('order_id', orderId)
          .single()
      ]);

      if (orderResult.error) throw orderResult.error;
      if (itemsResult.error) throw itemsResult.error;
      if (packingSlipResult.error) throw packingSlipResult.error;

      setOrder(orderResult.data);
      setOrderItems(itemsResult.data || []);
      setPackingSlip(packingSlipResult.data);
      
      // Populate edit form with existing data
      if (packingSlipResult.data) {
        setEditData({
          invoice_number: packingSlipResult.data.invoice_number,
          shipping_method: packingSlipResult.data.shipping_method,
          netsuite_reference: packingSlipResult.data.netsuite_reference || '',
          notes: packingSlipResult.data.notes || ''
        });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      const element = document.getElementById('packing-slip-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
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
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Error generating PDF. Please try again.');
    }
  };

  const handleEdit = async () => {
    try {
      const { error } = await supabase
        .from('packing_slips')
        .update(editData)
        .eq('id', packingSlip?.id);

      if (error) throw error;

      // Refresh data
      await fetchData();
      setShowEditForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const generatePackingSlipHTML = (order: Order, items: OrderItem[], packingSlip: PackingSlip): string => {
    const companyName = order.company?.company_name || 'N/A';
    const subsidiary = order.company?.subsidiary;
    
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
          <td style="border: 1px solid #000; padding: 8px; text-align: left; font-size: 12px;">${product?.sku || 'N/A'}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: left; font-size: 12px;">${product?.item_name || 'N/A'}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px;">${item.quantity}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px;">${casePack}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px;">${cases}</td>
          <td style="border: 1px solid #000; padding: 8px; text-align: center; font-size: 12px;">${weight.toFixed(2)} kg</td>
        </tr>
      `;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Packing Slip - ${packingSlip.invoice_number}</title>
        <style>
          @page { size: A4 portrait; margin: 0.5in; }
          body { font-family: 'Inter', Arial, sans-serif; margin: 0; color: #1a202c; line-height: 1.6; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .container { max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e2e8f0; }
          .company-info h1 { font-size: 28px; font-weight: 700; color: #1a202c; margin: 0 0 10px 0; }
          .company-address { font-size: 14px; color: #4a5568; line-height: 1.5; }
          .logo { width: 120px; height: auto; }
          .invoice-details { background: #f7fafc; padding: 20px; border-radius: 8px; margin-bottom: 30px; }
          .invoice-title { font-size: 24px; font-weight: 700; color: #1a202c; margin-bottom: 20px; text-align: center; }
          .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .detail-group h3 { font-size: 14px; font-weight: 600; color: #2d3748; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; }
          .detail-group p { margin: 0; font-size: 14px; color: #4a5568; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          .items-table th { background: #f7fafc; padding: 12px 8px; border: 1px solid #e2e8f0; text-align: left; font-size: 12px; font-weight: 600; color: #2d3748; text-transform: uppercase; letter-spacing: 0.5px; }
          .items-table td { padding: 8px; border: 1px solid #e2e8f0; font-size: 12px; }
          .totals { text-align: right; margin-top: 20px; }
          .totals-table { margin-left: auto; }
          .totals-table td { padding: 8px 16px; border: none; }
          .totals-table .total-row { font-weight: 600; color: #1a202c; }
          .notes { margin-top: 30px; padding: 20px; background: #f7fafc; border-radius: 8px; }
          .notes h3 { font-size: 16px; font-weight: 600; color: #2d3748; margin: 0 0 10px 0; }
          .notes p { margin: 0; font-size: 14px; color: #4a5568; white-space: pre-line; }
          .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
          .signature-box { width: 200px; text-align: center; }
          .signature-line { border-top: 1px solid #2d3748; padding-top: 5px; margin-top: 30px; font-size: 12px; color: #4a5568; }
          @media print { 
            body { margin: 0; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header -->
          <div class="header">
            <div class="company-info">
              <h1>${subsidiary?.name || 'Qiqi Partners'}</h1>
              <div class="company-address">${subsidiary?.ship_from_address || 'Address not configured'}</div>
              ${subsidiary?.phone ? `<div>Phone: ${subsidiary.phone}</div>` : ''}
              ${subsidiary?.email ? `<div>Email: ${subsidiary.email}</div>` : ''}
            </div>
            <div class="logo-container">
              <img src="/QIQI-Logo.svg" alt="Qiqi Logo" class="logo" />
            </div>
          </div>

          <!-- Invoice Details -->
          <div class="invoice-details">
            <div class="invoice-title">PACKING SLIP</div>
            <div class="details-grid">
              <div class="detail-group">
                <h3>Ship To</h3>
                <p><strong>${companyName}</strong><br>
                ${order.company?.ship_to || 'Ship To Address not configured'}</p>
              </div>
              <div class="detail-group">
                <h3>Order Details</h3>
                <p><strong>Date:</strong> ${new Date().toLocaleDateString()}<br>
                <strong>Invoice:</strong> ${packingSlip.invoice_number}<br>
                <strong>Method:</strong> ${packingSlip.shipping_method}<br>
                <strong>Reference:</strong> ${packingSlip.netsuite_reference || 'N/A'}</p>
              </div>
            </div>
          </div>

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

          <!-- Totals -->
          <div class="totals">
            <table class="totals-table">
              <tr>
                <td><strong>Total Cases:</strong></td>
                <td class="total-row"><strong>${totalCases}</strong></td>
              </tr>
              <tr>
                <td><strong>Total Weight:</strong></td>
                <td class="total-row"><strong>${totalWeight.toFixed(2)} kg</strong></td>
              </tr>
            </table>
          </div>

          ${packingSlip.notes ? `
          <!-- Notes -->
          <div class="notes">
            <h3>Notes</h3>
            <p>${packingSlip.notes}</p>
          </div>
          ` : ''}

          <!-- Signature Section -->
          <div class="signature-section">
            <div class="signature-box">
              <div class="signature-line">Shipper Signature</div>
            </div>
            <div class="signature-box">
              <div class="signature-line">Date</div>
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
          <p>Loading packing slip...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !order || !packingSlip) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Packing Slip Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The packing slip you are looking for does not exist.'}</p>
            <Link
              href={`/admin/orders/${orderId}`}
              className="bg-black text-white px-4 py-2 hover:opacity-90 transition"
            >
              Back to Order
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-8 pb-16">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Packing Slip</h1>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleDownloadPDF}
              className="bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 transition disabled:opacity-50"
            >
              Download PDF
            </button>
            {order?.status !== 'Done' && order?.status !== 'Cancelled' && (
              <button
                onClick={() => setShowEditForm(true)}
                className="bg-green-600 text-white px-4 py-2 hover:bg-green-700 transition"
              >
                Edit
              </button>
            )}
            <Link
              href={`/admin/orders/${orderId}`}
              className="text-gray-600 hover:text-gray-800"
            >
              ← Back to Order
            </Link>
          </div>
        </div>

        {/* Packing Slip Content */}
        <Card header="">
          <div id="packing-slip-content" className="px-6 py-5 space-y-6">
            {/* Top Section: Logo, Subsidiary Info, and Ship To */}
            <div className="flex justify-between items-start">
              {/* Left: Logo and Subsidiary Info */}
              <div className="flex items-start space-x-4">
                <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-16 w-auto" />
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">
                    {order.company?.subsidiary?.name || 'Subsidiary Name'}
                  </h2>
                  <div className="text-sm text-gray-600 whitespace-pre-line">
                    {order.company?.subsidiary?.company_address || 'Subsidiary Address'}
                  </div>
                </div>
              </div>

              {/* Right: Ship To Details */}
              <div className="text-right">
                <h3 className="font-bold text-gray-900 mb-2">Ship To</h3>
                <div className="text-sm text-gray-600">
                  <div className="font-medium">{order.company?.company_name || 'Company Name'}</div>
                  <div className="whitespace-pre-line">
                    {order.company?.ship_to || 'Company Address'}
                  </div>
                </div>
              </div>
            </div>

            {/* Packing Slip Title and Number */}
            <div className="flex justify-start">
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-1">Packing Slip</h2>
                <div className="text-sm text-gray-600">#{packingSlip.invoice_number}</div>
              </div>
            </div>

            {/* Items Table */}
            <div className="py-4">
              <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
                <thead>
                  <tr className="border-b border-[#e5e5e5]">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">SKU</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">Case Pack</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Case Qty</th>
                    <th className="text-right py-3 px-4 font-medium text-gray-600">Total Units</th>
                  </tr>
                </thead>
                <tbody>
                  {orderItems.map((item) => {
                    const product = item.product;
                    const casePack = product?.case_pack || 1;
                    const totalUnits = item.quantity * casePack;
                    
                    return (
                      <tr key={item.id} className="border-b border-[#e5e5e5] hover:bg-gray-50">
                        <td className="py-3 px-4 text-sm text-gray-900">{product?.sku || 'N/A'}</td>
                        <td className="py-3 px-4 text-sm text-gray-900">{casePack}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right">{item.quantity}</td>
                        <td className="py-3 px-4 text-sm text-gray-900 text-right">{totalUnits}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="text-right space-y-2">
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-900">Total Units:</span>
                  <span className="font-bold text-gray-900 ml-8">
                    {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      return sum + (item.quantity * casePack);
                    }, 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-900">Total Cases:</span>
                  <span className="font-bold text-gray-900 ml-8">
                    {orderItems.reduce((sum, item) => sum + item.quantity, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes Section */}
            <div className="py-4">
              <div className="border-t border-[#e5e5e5] pt-4">
                <h3 className="text-sm font-medium text-gray-900 mb-2">Notes:</h3>
                <div className="min-h-[60px] text-sm text-gray-600">
                  {packingSlip.notes || 'No notes'}
                </div>
              </div>
            </div>

          </div>
        </Card>

        {/* Edit Form Modal */}
        {showEditForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Edit Packing Slip</h2>
                <button
                  onClick={() => setShowEditForm(false)}
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
                    value={editData.invoice_number}
                    onChange={(e) => setEditData(prev => ({ ...prev, invoice_number: e.target.value }))}
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
                    value={editData.shipping_method}
                    onChange={(e) => setEditData(prev => ({ ...prev, shipping_method: e.target.value }))}
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
                    value={editData.netsuite_reference}
                    onChange={(e) => setEditData(prev => ({ ...prev, netsuite_reference: e.target.value }))}
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
                    value={editData.notes}
                    onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black h-24"
                    placeholder="Enter any additional notes for the packing slip"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditForm(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEdit}
                  className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 transition"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
