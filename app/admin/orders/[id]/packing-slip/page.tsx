'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import AdminLayout from '../../../../components/AdminLayout';
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
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    setIsPrintMode(true);
    window.print();
    setIsPrintMode(false);
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
      <div className="min-h-screen bg-gray-50">
        {/* Header - Hidden in print */}
        <div className={`bg-white shadow-sm border-b ${isPrintMode ? 'hidden' : ''}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Packing Slip</h1>
                <p className="text-sm text-gray-600">Invoice #{packingSlip.invoice_number}</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handlePrint}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Print / Save PDF
                </button>
                <Link
                  href={`/admin/orders/${orderId}`}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Back to Order
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Packing Slip Content */}
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-200">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {order.company?.subsidiary?.name || 'Qiqi Partners'}
                </h1>
                <div className="text-gray-600 text-sm leading-relaxed">
                  {order.company?.subsidiary?.ship_from_address || 'Address not configured'}
                </div>
                {order.company?.subsidiary?.phone && (
                  <div className="text-gray-600 text-sm">Phone: {order.company.subsidiary.phone}</div>
                )}
                {order.company?.subsidiary?.email && (
                  <div className="text-gray-600 text-sm">Email: {order.company.subsidiary.email}</div>
                )}
              </div>
              <div className="text-right">
                <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-16 w-auto" />
              </div>
            </div>

            {/* Packing Slip Title */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">PACKING SLIP</h2>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 p-6 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Ship To</h3>
                <div className="text-gray-900">
                  <div className="font-semibold">{order.company?.company_name || 'N/A'}</div>
                  <div className="mt-1 whitespace-pre-line text-sm">
                    {order.company?.ship_to || 'Ship To Address not configured'}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Order Details</h3>
                <div className="space-y-1 text-sm">
                  <div><span className="font-medium">Date:</span> {new Date().toLocaleDateString()}</div>
                  <div><span className="font-medium">Invoice:</span> {packingSlip.invoice_number}</div>
                  <div><span className="font-medium">Method:</span> {packingSlip.shipping_method}</div>
                  <div><span className="font-medium">Reference:</span> {packingSlip.netsuite_reference || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Product Name</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Total Units</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Case Pack</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Cases</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Total Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orderItems.map((item) => {
                    const product = item.product;
                    const casePack = product?.case_pack || 1;
                    const cases = Math.ceil(item.quantity / casePack);
                    const caseWeight = product?.case_weight || 0;
                    const weight = cases * caseWeight;
                    
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">{product?.sku || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{product?.item_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{casePack}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{cases}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{weight.toFixed(2)} kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="text-right">
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-900">Total Cases:</span>
                  <span className="font-bold text-gray-900 ml-8">
                    {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      return sum + Math.ceil(item.quantity / casePack);
                    }, 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-900">Total Weight:</span>
                  <span className="font-bold text-gray-900 ml-8">
                    {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      const cases = Math.ceil(item.quantity / casePack);
                      const caseWeight = item.product?.case_weight || 0;
                      return sum + (cases * caseWeight);
                    }, 0).toFixed(2)} kg
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {packingSlip.notes && (
              <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Notes</h3>
                <p className="text-gray-700 whitespace-pre-line">{packingSlip.notes}</p>
              </div>
            )}

            {/* Signature Section */}
            <div className="flex justify-between mt-12">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 w-48">
                  <div className="text-sm text-gray-600">Shipper Signature</div>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 w-48">
                  <div className="text-sm text-gray-600">Date</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
