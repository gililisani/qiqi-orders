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
      pdf.setTextColor(options.color || 0, 0, 0);
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
        addText(header, xPos, startY, { fontSize: 9, color: [60, 60, 60] });
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
    addText('PACKING SLIP', pageWidth / 2, yPosition, { fontSize: 18, color: [0, 0, 0] });
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
    addText('SHIP FROM:', 15, yPosition, { fontSize: 12, color: [60, 60, 60] });
    yPosition += 7;
    addText(order.company?.subsidiary?.name || 'N/A', 15, yPosition);
    addText(order.company?.subsidiary?.ship_from_address || 'N/A', 15, yPosition + 5);
    yPosition += 15;

    addText('SHIP TO:', 15, yPosition, { fontSize: 12, color: [60, 60, 60] });
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
      
      addText('NOTES:', 15, yPosition, { fontSize: 12, color: [60, 60, 60] });
      yPosition += 7;
      
      const noteLines = pdf.splitTextToSize(packingSlip.notes, 180);
      noteLines.forEach((line: string) => {
        addText(line, 15, yPosition, { fontSize: 9 });
        yPosition += 5;
      });
    }

    // Footer
    const finalY = pageHeight - 20;
    addText(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, finalY, { fontSize: 8, color: [100, 100, 100] });

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
