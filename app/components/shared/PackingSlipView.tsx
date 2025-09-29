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

      // Fetch client information separately (for admin users)
      let clientData = null;
      if (role === 'admin') {
        const { data: clientResult, error: clientError } = await supabase
          .from('clients')
          .select('name, email')
          .eq('id', orderData.user_id)
          .single();
        
        if (clientError && clientError.code !== 'PGRST116') {
          console.warn('Could not fetch client data:', clientError);
        } else {
          clientData = clientResult;
        }
      }

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
        client: clientData,
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
    if (!order || !orderItems || !packingSlip) return;

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    let yPosition = 20;

    // Helper function to add text
    const addText = (text: string, x: number, y: number, options: any = {}) => {
      pdf.setFontSize(options.fontSize || 10);
      if (options.color) {
        if (Array.isArray(options.color)) {
          pdf.setTextColor(options.color[0], options.color[1], options.color[2]);
        } else {
          pdf.setTextColor(options.color);
        }
      } else {
        pdf.setTextColor(0, 0, 0);
      }
      pdf.text(text, x, y);
    };

    // Helper function to add line
    const addLine = (x1: number, y1: number, x2: number, y2: number) => {
      pdf.line(x1, y1, x2, y2);
    };

    // Helper function to add table header
    const addTableHeader = (headers: string[], startY: number) => {
      const colWidths = [60, 25, 20, 20, 20, 25, 20]; // Adjust widths for A4
      let xPos = 15;
      
      // Header background
      pdf.setFillColor(240, 240, 240);
      pdf.rect(15, startY - 5, 180, 10, 'F');
      
      headers.forEach((header, index) => {
        addText(header, xPos, startY, { fontSize: 9, color: 60 });
        xPos += colWidths[index];
      });
      
      // Header line
      addLine(15, startY + 2, 195, startY + 2);
      return startY + 8;
    };

    // Helper function to add table row
    const addTableRow = (data: string[], startY: number) => {
      const colWidths = [60, 25, 20, 20, 20, 25, 20];
      let xPos = 15;
      
      data.forEach((cell, index) => {
        // Word wrap for long text
        const maxWidth = colWidths[index] - 2;
        const lines = pdf.splitTextToSize(cell, maxWidth);
        
        lines.forEach((line: string, lineIndex: number) => {
          addText(line, xPos, startY + (lineIndex * 4), { fontSize: 8 });
        });
        
        xPos += colWidths[index];
      });
      
      // Row line
      addLine(15, startY + 8, 195, startY + 8);
      return startY + 12;
    };

    // Header
    addText('PACKING SLIP', pageWidth / 2, yPosition, { fontSize: 18 });
    yPosition += 10;
    
    // Invoice details
    addText(`Invoice: ${packingSlip.invoice_number}`, 15, yPosition, { fontSize: 12 });
    addText(`Date: ${new Date().toLocaleDateString()}`, 15, yPosition + 5);
    addText(`Method: ${packingSlip.shipping_method}`, 15, yPosition + 10);
    if (packingSlip.netsuite_reference) {
      addText(`Reference: ${packingSlip.netsuite_reference}`, 15, yPosition + 15);
    }
    yPosition += 25;

    // Company information
    addText('SHIP FROM:', 15, yPosition, { fontSize: 12, color: 60 });
    yPosition += 7;
    addText(order.company?.subsidiary?.name || 'N/A', 15, yPosition);
    addText(order.company?.subsidiary?.ship_from_address || 'N/A', 15, yPosition + 5);
    yPosition += 15;

    addText('SHIP TO:', 15, yPosition, { fontSize: 12, color: 60 });
    yPosition += 7;
    addText(order.company?.company_name || 'N/A', 15, yPosition);
    addText(order.company?.ship_to || 'N/A', 15, yPosition + 5);
    yPosition += 20;

    // Check if we need a new page for the table
    if (yPosition > 200) {
      pdf.addPage();
      yPosition = 20;
    }

    // Items table
    const headers = ['Product', 'SKU', 'Qty', 'Pack', 'Weight', 'HS Code', 'Made In'];
    yPosition = addTableHeader(headers, yPosition);

    // Add items
    orderItems.forEach((item) => {
      // Check if we need a new page
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = addTableHeader(headers, 20);
      }

      const rowData = [
        item.product?.item_name || 'N/A',
        item.product?.sku || 'N/A',
        item.quantity.toString(),
        item.product?.case_pack?.toString() || 'N/A',
        item.product?.case_weight ? `${item.product.case_weight} lbs` : 'N/A',
        item.product?.hs_code || 'N/A',
        item.product?.made_in || 'N/A'
      ];

      yPosition = addTableRow(rowData, yPosition);
    });

    // Notes section
    if (packingSlip.notes) {
      yPosition += 10;
      if (yPosition > 250) {
        pdf.addPage();
        yPosition = 20;
      }
      
      addText('NOTES:', 15, yPosition, { fontSize: 12, color: 60 });
      yPosition += 7;
      
      const noteLines = pdf.splitTextToSize(packingSlip.notes, 180);
      noteLines.forEach((line: string) => {
        addText(line, 15, yPosition, { fontSize: 9 });
        yPosition += 5;
      });
    }

    // Footer
    const finalY = pageHeight - 20;
    addText(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, finalY, { fontSize: 8, color: 100 });

    pdf.save(`packing-slip-${packingSlip.invoice_number || 'invoice'}.pdf`);
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
    <div>
      {/* Navigation */}
      <div className="mb-6">
        <Link
          href={backUrl}
          className="inline-flex items-center text-gray-600 hover:text-gray-800 mb-4 font-sans text-sm"
        >
          ← Back to Order
        </Link>
      </div>

      {/* Action Buttons at Top */}
      <div className="flex justify-end gap-3 mb-6">
          <button
            onClick={generatePDF}
            className="bg-black text-white px-4 py-2 rounded transition hover:opacity-90 focus:ring-2 focus:ring-gray-900 font-sans text-sm"
          >
            Download PDF
          </button>

          {canEdit && (
            <button
              onClick={() => setEditMode(!editMode)}
              className="bg-gray-100 text-gray-900 px-4 py-2 rounded transition hover:bg-gray-200 focus:ring-2 focus:ring-gray-300 font-sans text-sm"
            >
              {editMode ? 'Cancel Edit' : 'Edit'}
            </button>
          )}
        </div>

        {/* Single Block Layout */}
        <Card>
          <div id="packing-slip-content" className="px-6 py-8 space-y-8">
            {/* Header Section */}
            <div className="border-b border-[#e5e5e5] pb-8">
              {/* Logo */}
              <div className="mb-6">
                <img 
                  src="/QIQI-Logo.svg" 
                  alt="QIQI Logo" 
                  className="h-12 w-auto"
                />
              </div>

              {/* Company Info Row */}
              <div className="flex justify-between items-start mb-8">
                {/* Left Side - Subsidiary */}
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 mb-2 font-sans text-lg">
                    {order.company?.subsidiary?.name || 'N/A'}
                  </h3>
                  <p className="text-gray-600 font-sans text-sm leading-relaxed">
                    {order.company?.subsidiary?.ship_from_address || 'N/A'}
                  </p>
                </div>

                {/* Right Side - Company Info */}
                <div className="text-right flex-1">
                  <h4 className="font-medium text-gray-700 mb-2 font-sans text-sm uppercase tracking-wider">Ship To:</h4>
                  <h3 className="font-semibold text-gray-900 mb-2 font-sans text-lg">
                    {order.company?.company_name || 'N/A'}
                  </h3>
                  <p className="text-gray-600 font-sans text-sm leading-relaxed">
                    {order.company?.ship_to || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Title and Date Row */}
              <div className="flex justify-between items-center">
                {/* Centered Title */}
                <div className="flex-1"></div>
                <div className="flex-1 text-center">
                  <h1 className="text-3xl font-bold text-gray-900 font-sans">PACKING SLIP</h1>
                </div>
                {/* Right aligned Date */}
                <div className="flex-1 text-right">
                  <p className="text-gray-600 font-sans text-sm">
                    Date: {new Date().toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Invoice Details */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Invoice Number</label>
                <div className="text-lg font-semibold text-gray-900 font-sans">#{packingSlip.invoice_number}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Shipping Method</label>
                <div className="text-lg font-semibold text-gray-900 font-sans">{packingSlip.shipping_method}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">QIQI Sales Order</label>
                <div className="text-lg font-semibold text-gray-900 font-sans">{packingSlip.netsuite_reference || 'N/A'}</div>
              </div>
            </div>

            {/* Items Table */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4 font-sans">Items</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
                  <thead>
                    <tr className="border-b border-[#e5e5e5]">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">SKU</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">Case Pack</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">Case Qty</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">Total Units</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">Weight</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">HS Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider font-sans">Made In</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item) => {
                      const casePack = item.product?.case_pack || 1;
                      const caseQty = Math.ceil(item.quantity / casePack);
                      const totalWeight = (item.product?.case_weight || 0) * caseQty;
                      
                      return (
                        <tr key={item.id} className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{item.product?.item_name || 'N/A'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-sans">{item.product?.sku || 'N/A'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{casePack}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{caseQty}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{item.quantity}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{totalWeight.toFixed(1)} lbs</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{item.product?.hs_code || 'N/A'}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{item.product?.made_in || 'N/A'}</td>
                        </tr>
                      );
                    })}
                    
                  </tbody>
                </table>
                
                {/* Totals Section - Below table, to the right of table */}
                <div className="flex justify-end mt-4">
                  <div className="w-[120px] text-left">
                    <hr className="border-gray-300 mb-2" />
                    <div className="text-sm font-semibold text-gray-900 font-sans mb-1">TOTALS</div>
                    <div className="text-sm text-gray-900 font-sans">Cases: {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      return sum + Math.ceil(item.quantity / casePack);
                    }, 0)}</div>
                    <div className="text-sm text-gray-900 font-sans">Units: {orderItems.reduce((sum, item) => sum + item.quantity, 0)}</div>
                    <div className="text-sm text-gray-900 font-sans">Weight: {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      const caseQty = Math.ceil(item.quantity / casePack);
                      const totalWeight = (item.product?.case_weight || 0) * caseQty;
                      return sum + totalWeight;
                    }, 0).toFixed(1)} kg</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes */}
            {packingSlip.notes && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3 font-sans">Notes</h3>
                <div className="bg-gray-50 p-4 rounded-lg border border-[#e5e5e5]">
                  <p className="text-gray-700 font-sans text-sm">{packingSlip.notes}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Edit Form Modal */}
        {editMode && canEdit && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 font-sans">Edit Packing Slip</h2>
                  <button
                    onClick={() => setEditMode(false)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Invoice Number</label>
                    <input
                      type="text"
                      value={editData.invoice_number}
                      onChange={(e) => setEditData(prev => ({ ...prev, invoice_number: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter invoice number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Shipping Method</label>
                    <input
                      type="text"
                      value={editData.shipping_method}
                      onChange={(e) => setEditData(prev => ({ ...prev, shipping_method: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter shipping method"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">QIQI Sales Order</label>
                    <input
                      type="text"
                      value={editData.netsuite_reference}
                      onChange={(e) => setEditData(prev => ({ ...prev, netsuite_reference: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter QIQI sales order reference"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Notes</label>
                    <textarea
                      value={editData.notes}
                      onChange={(e) => setEditData(prev => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      rows={3}
                      placeholder="Enter any additional notes for the packing slip"
                    />
                  </div>
                </div>

                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={() => setEditMode(false)}
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded transition hover:bg-gray-200 focus:ring-2 focus:ring-gray-300 font-sans text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 bg-black text-white px-4 py-2 rounded transition hover:opacity-90 focus:ring-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed font-sans text-sm"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
    </div>
  );
}
