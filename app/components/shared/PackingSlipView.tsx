'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSupabase } from '../../../lib/supabase-provider';
import Card from '../ui/Card';
import { Spinner, Typography } from '../MaterialTailwind';
import Link from 'next/link';
import jsPDF from 'jspdf';
import 'svg2pdf.js'; // This patches jsPDF with .svg() method
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
  invoice_number?: string | null;
  so_number?: string | null;
  number_of_pallets?: number | null;
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
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  vat_number?: string;
  created_at: string;
  created_by: string;
}

interface PackingSlipViewProps {
  role: 'admin' | 'client';
  backUrl: string;
}

export default function PackingSlipView({ role, backUrl }: PackingSlipViewProps) {
  const { supabase } = useSupabase();
  const params = useParams();
  const orderId = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packingSlip, setPackingSlip] = useState<PackingSlip | null>(null);
  // Loading handled by AdminLayout
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    invoice_number: '',
    shipping_method: '',
    netsuite_reference: '',
    notes: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    vat_number: ''
  });

  const fetchOrderData = async () => {
    try {
      // Loading handled by AdminLayout
      setError(null);

      // Debug: Check current user
      const { data: { user } } = await supabase.auth.getUser();

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
        // Smart approach: Check if user is admin first, then fetch from appropriate table
        // First, try admins table (since orders can be created by admins)
        const { data: adminResult, error: adminError } = await supabase
          .from('admins')
          .select('name, email')
          .eq('id', orderData.user_id)
          .single();
        
        if (!adminError && adminResult) {
          clientData = adminResult;
        } else {
          // If not found in admins, try clients table
          const { data: clientResult, error: clientError } = await supabase
            .from('clients')
            .select('name, email')
            .eq('id', orderData.user_id)
            .single();
          
          if (!clientError && clientResult) {
            clientData = clientResult;
          } else {
            clientData = { name: 'Unknown User', email: 'unknown@example.com' };
          }
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

      // Fetch packing slip - use a more direct approach
      
      // Try to fetch packing slip - if it fails, we'll treat it as no packing slip found
      let packingSlipData = null;
      let packingSlipError = null;
      
      try {
        const result = await supabase
          .from('packing_slips')
          .select('*')
          .eq('order_id', orderId)
          .single();
        packingSlipData = result.data;
        packingSlipError = result.error;
      } catch (err) {
        console.error('Packing slip fetch exception:', err);
        packingSlipError = err;
      }

      if (packingSlipError && (packingSlipError as any).code !== 'PGRST116') {
        console.error('Packing slip fetch error:', packingSlipError);
        // If it's a permission error (406), treat as no packing slip found
        if ((packingSlipError as any).code === 'PGRST205' || (packingSlipError as any).message?.includes('406') || (packingSlipError as any).message?.includes('Not Acceptable')) {
          // Don't throw error, just continue with no packing slip data
          packingSlipData = null; // Ensure it's null so we show the create option
        } else {
          throw packingSlipError;
        }
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
          notes: packingSlipData.notes || '',
          contact_name: packingSlipData.contact_name || '',
          contact_email: packingSlipData.contact_email || '',
          contact_phone: packingSlipData.contact_phone || '',
          vat_number: packingSlipData.vat_number || ''
        });
      }

    } catch (err: any) {
      console.error('Error fetching order data:', err);
      setError(err.message || 'Failed to load order data');
    } finally {
      // Loading handled by AdminLayout
    }
  };

  const generatePDF = async () => {
    if (!order || !orderItems || !packingSlip) {
      setError('No packing slip found to generate PDF');
      return;
    }

    // Landscape A4 to match web page layout
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageWidth = 297; // A4 landscape width
    const pageHeight = 210; // A4 landscape height
    const margin = 15; // Margins for printing
    const contentWidth = pageWidth - (margin * 2);
    let currentY = margin;

    // Helper function to add text
    const addText = (text: string, x: number, y: number, options: any = {}) => {
      pdf.setFontSize(options.fontSize || 10);
      pdf.setFont('helvetica', options.fontStyle || 'normal');
      
      if (options.color) {
        if (Array.isArray(options.color)) {
          pdf.setTextColor(options.color[0], options.color[1], options.color[2]);
        } else {
          pdf.setTextColor(options.color);
        }
      } else {
        pdf.setTextColor(0, 0, 0);
      }
      
      if (options.align === 'center') {
        pdf.text(text, x, y, { align: 'center' });
      } else if (options.align === 'right') {
        pdf.text(text, x, y, { align: 'right' });
      } else {
        pdf.text(text, x, y);
      }
    };

    // Helper function to add line
    const addLine = (x1: number, y1: number, x2: number, y2: number) => {
      pdf.setDrawColor(229, 229, 229);
      pdf.setLineWidth(0.1); // Ensure thin lines
      pdf.line(x1, y1, x2, y2);
    };

    // Helper function to add logo - use SVG only
    const addLogo = async (x: number, y: number) => {
      try {
        // Use SVG logo (only logo file in project)
        const svgPaths = ['/QIQI-Logo.svg', 'QIQI-Logo.svg'];
        
        for (const svgPath of svgPaths) {
          try {
            const svgResponse = await fetch(svgPath);
            if (svgResponse.ok) {
              const svgText = await svgResponse.text();
              
              // Create SVG element for svg2pdf
              const parser = new DOMParser();
              const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
              const svgElement = svgDoc.querySelector('svg');
              
              if (svgElement) {
                // Use pdf.svg() method which supports x,y positioning
                // Logo dimensions: 50mm width, aspect ratio 2.13:1
                const logoWidth = 50; // mm
                const logoHeight = logoWidth / 2.13; // Maintain aspect ratio (approx 23.5mm)
                
                console.log('SVG Logo Rendering:', {
                  x: x,
                  y: y,
                  width: logoWidth,
                  height: logoHeight,
                  viewBox: svgElement.getAttribute('viewBox'),
                  svgWidth: svgElement.getAttribute('width'),
                  svgHeight: svgElement.getAttribute('height')
                });
                
                // Render SVG at exact position with proper sizing
                await pdf.svg(svgElement, {
                  x: x,           // x position (margin)
                  y: y,           // y position (currentY)
                  width: logoWidth,
                  height: logoHeight
                });
                
                return; // Success, exit function
              }
            }
          } catch (error) {
            console.log(`Failed to load SVG from ${svgPath}:`, error);
            continue;
          }
        }
        
        // Final fallback to text logo
        addText('QIQI', x, y, { fontSize: 14, fontStyle: 'bold' });
        addText('GLOBAL', x, y + 5, { fontSize: 10 });
        
      } catch (error) {
        console.log('Logo loading failed:', error);
        // Fallback to text logo
        addText('QIQI', x, y, { fontSize: 14, fontStyle: 'bold' });
        addText('GLOBAL', x, y + 5, { fontSize: 10 });
      }
    };

    // Grid Layout - Two columns like web page
    const leftColWidth = (contentWidth - 20) / 2;
    const rightColX = margin + leftColWidth + 20;
    
    // Top row - Logo (left) and Ship To (right)
    // Ensure logo is properly aligned with document margins
    await addLogo(margin, currentY);
    
    // Ship To section in top right - positioned left enough so text doesn't get cut
    const shipToX = pageWidth - margin - 80; // Move left by 80mm to prevent text cutoff
    addText('SHIP TO:', shipToX, currentY, { fontSize: 12, align: 'left' });
    addText(order.company?.company_name || 'N/A', shipToX, currentY + 6, { fontSize: 12, fontStyle: 'bold', align: 'left' });
    
    const shipToAddress = order.company?.ship_to || 'N/A';
    const shipToLines = pdf.splitTextToSize(shipToAddress, 75); // Narrower width for better fit
    let shipToY = currentY + 12;
    shipToLines.forEach((line: string, index: number) => {
      addText(line, shipToX, shipToY + (index * 4), { fontSize: 9, align: 'left' });
    });

    // Contact information below Ship To
    let contactY = shipToY + (shipToLines.length * 4) + 8;
    if (packingSlip.contact_name || packingSlip.contact_email || packingSlip.contact_phone) {
      if (packingSlip.contact_name) {
        addText(`Contact: ${packingSlip.contact_name}`, shipToX, contactY, { fontSize: 8, align: 'left' });
        contactY += 4;
      }
      if (packingSlip.contact_email) {
        addText(`Email: ${packingSlip.contact_email}`, shipToX, contactY, { fontSize: 8, align: 'left' });
        contactY += 4;
      }
      if (packingSlip.contact_phone) {
        addText(`Phone: ${packingSlip.contact_phone}`, shipToX, contactY, { fontSize: 8, align: 'left' });
        contactY += 4;
      }
      if (packingSlip.vat_number) {
        addText(`VAT #: ${packingSlip.vat_number}`, shipToX, contactY, { fontSize: 8, align: 'left' });
      }
    }

    // Calculate the maximum Y position used by the right column
    const rightColumnEndY = Math.max(
      contactY + (packingSlip.vat_number ? 4 : 0),
      currentY + 30 // Logo height
    );

    // Left column - Subsidiary info below logo
    currentY += 30; // Move below logo
    const subsidiaryName = order.company?.subsidiary?.name || 'N/A';
    const subsidiaryAddress = order.company?.subsidiary?.ship_from_address || 'N/A';
    
    addText(subsidiaryName, margin, currentY, { fontSize: 12, fontStyle: 'bold' });
    currentY += 6;
    
    const addressLines = pdf.splitTextToSize(subsidiaryAddress, leftColWidth - 10);
    addressLines.forEach((line: string) => {
      addText(line, margin, currentY, { fontSize: 9 });
      currentY += 4;
    });

    // Update currentY to be after the tallest column
    currentY = Math.max(currentY + 10, rightColumnEndY + 10);

    currentY += 15;

    // Title and Date Row (matches web page)
    addText('PACKING SLIP', pageWidth / 2, currentY, { fontSize: 20, fontStyle: 'bold', align: 'center' });
    addText(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin, currentY, { fontSize: 9, align: 'right' });
    currentY += 15;

    // Separator line
    addLine(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;

    // Invoice Details (matches web page grid layout)
    const invoiceY = currentY;
    const detailColWidth = contentWidth / 4;
    
    addText('Invoice Number', margin, invoiceY, { fontSize: 8, fontStyle: 'bold' });
    addText(`#${packingSlip.invoice_number}`, margin, invoiceY + 5, { fontSize: 11, fontStyle: 'bold' });
    
    addText('Shipping Method', margin + detailColWidth, invoiceY, { fontSize: 8, fontStyle: 'bold' });
    addText(packingSlip.shipping_method, margin + detailColWidth, invoiceY + 5, { fontSize: 11, fontStyle: 'bold' });
    
    addText('QIQI Sales Order', margin + (detailColWidth * 2), invoiceY, { fontSize: 8, fontStyle: 'bold' });
    addText(packingSlip.netsuite_reference || 'N/A', margin + (detailColWidth * 2), invoiceY + 5, { fontSize: 11, fontStyle: 'bold' });
    
    addText('Destination Country', margin + (detailColWidth * 3), invoiceY, { fontSize: 8, fontStyle: 'bold' });
    addText(getDestinationCountry(), margin + (detailColWidth * 3), invoiceY + 5, { fontSize: 11, fontStyle: 'bold' });
    
    currentY += 20;

    // Separator line
    addLine(margin, currentY, pageWidth - margin, currentY);
    currentY += 10;

    // Items Table (matches web page table)
    const tableHeaders = ['Item', 'SKU', 'Case Pack', 'Case Qty', 'Total Units', 'Weight', 'HS Code', 'Made In'];
    const colWidths = [95, 25, 20, 20, 25, 25, 30, 25]; // Balanced columns
    
    // Table header
    let xPos = margin;
    pdf.setFillColor(229, 229, 229); // Light gray #e5e5e5
    pdf.rect(margin, currentY - 2, contentWidth, 10, 'F');
    
    tableHeaders.forEach((header, index) => {
      if (index === 0) {
        // Item column - left aligned, vertically centered
        addText(header, xPos + 2, currentY + 5, { fontSize: 9, fontStyle: 'bold', color: [75, 85, 99] });
      } else {
        // All other columns - center aligned, vertically centered
        const centerX = xPos + (colWidths[index] / 2);
        addText(header, centerX, currentY + 5, { fontSize: 9, fontStyle: 'bold', color: [75, 85, 99], align: 'center' });
      }
      xPos += colWidths[index];
    });
    
    addLine(margin, currentY + 7, pageWidth - margin, currentY + 7);
    currentY += 12;

    // Table rows
    orderItems.forEach((item) => {
      // Check if we need a new page
      if (currentY > pageHeight - 40) {
        pdf.addPage();
        currentY = margin;
        
        // Redraw header on new page
        xPos = margin;
        pdf.setFillColor(229, 229, 229); // Light gray #e5e5e5
        pdf.rect(margin, currentY - 2, contentWidth, 10, 'F');
        
        tableHeaders.forEach((header, index) => {
          if (index === 0) {
            // Item column - left aligned, vertically centered
            addText(header, xPos + 2, currentY + 5, { fontSize: 9, fontStyle: 'bold', color: [75, 85, 99] });
          } else {
            // All other columns - center aligned, vertically centered
            const centerX = xPos + (colWidths[index] / 2);
            addText(header, centerX, currentY + 5, { fontSize: 9, fontStyle: 'bold', color: [75, 85, 99], align: 'center' });
          }
          xPos += colWidths[index];
        });
        
        // Use consistent thin border for new page header
        pdf.setDrawColor(229, 229, 229); // Light gray border
        pdf.setLineWidth(0.1); // Ensure thin lines
        pdf.line(margin, currentY + 7, pageWidth - margin, currentY + 7);
        currentY += 12;
      }

      const casePack = item.product?.case_pack || 1;
      const caseQty = Math.ceil(item.quantity / casePack);
      const totalWeight = (item.product?.case_weight || 0) * caseQty;
      
      const rowData = [
        item.product?.item_name || 'N/A',
        item.product?.sku || 'N/A',
        casePack.toString(),
        caseQty.toString(),
        item.quantity.toString(),
        `${totalWeight.toFixed(1)} kg`,
        item.product?.hs_code || 'N/A',
        item.product?.made_in || 'N/A'
      ];
      
      xPos = margin;
      rowData.forEach((cell, index) => {
        if (index === 0) {
          // Item column - left aligned with word wrap
          const maxWidth = colWidths[index] - 4;
          const lines = pdf.splitTextToSize(cell, maxWidth);
          lines.forEach((line: string, lineIndex: number) => {
            addText(line, xPos + 2, currentY + (lineIndex * 3) + 6, { fontSize: 9 });
          });
        } else {
          // All other columns - center aligned
          const centerX = xPos + (colWidths[index] / 2);
          const maxWidth = colWidths[index] - 4;
          const lines = pdf.splitTextToSize(cell, maxWidth);
          lines.forEach((line: string, lineIndex: number) => {
            addText(line, centerX, currentY + (lineIndex * 3) + 6, { fontSize: 9, align: 'center' });
          });
        }
        xPos += colWidths[index];
      });
      
      // Use consistent thin border for all table rows
      pdf.setDrawColor(229, 229, 229); // Light gray border
      pdf.setLineWidth(0.1); // Ensure thin lines
      pdf.line(margin, currentY + 8, pageWidth - margin, currentY + 8);
      currentY += 10;
    });

    // Bottom Section: Notes (left 75%) and Totals (right 25%)
    currentY += 10;
    
    // Check if we need a new page for bottom section
    if (currentY > pageHeight - 60) {
      pdf.addPage();
      currentY = margin;
    }
    
    // Calculate column widths
    const notesWidth = contentWidth * 0.75; // 75% for notes
    const totalsWidth = contentWidth * 0.25; // 25% for totals
    const totalsX = margin + notesWidth + 10; // 10mm gap between columns
    
    // Store the starting Y position for both columns
    const bottomSectionY = currentY;
    
    // LEFT COLUMN: Notes Section (always show, even if empty)
    let notesY = bottomSectionY;
    addText('Notes', margin, notesY, { fontSize: 12, fontStyle: 'bold' });
    notesY += 8;
    
    if (packingSlip.notes) {
      const noteLines = pdf.splitTextToSize(packingSlip.notes, notesWidth - 10);
      noteLines.forEach((line: string) => {
        addText(line, margin, notesY, { fontSize: 9 });
        notesY += 5;
      });
    } else {
      // Show empty notes box
      addText('No additional notes', margin, notesY, { fontSize: 9, color: [128, 128, 128] });
      notesY += 6;
    }
    
    // RIGHT COLUMN: Totals Section
    let totalsY = bottomSectionY;
    addLine(totalsX, totalsY, pageWidth - margin, totalsY);
    totalsY += 8;
    
    addText('TOTALS', totalsX, totalsY, { fontSize: 8, fontStyle: 'bold' });
    totalsY += 6;
    
    const totalCases = orderItems.reduce((sum, item) => {
      const casePack = item.product?.case_pack || 1;
      return sum + Math.ceil(item.quantity / casePack);
    }, 0);
    
    const totalUnits = orderItems.reduce((sum, item) => sum + item.quantity, 0);
    
    const totalWeight = orderItems.reduce((sum, item) => {
      const casePack = item.product?.case_pack || 1;
      const caseQty = Math.ceil(item.quantity / casePack);
      const itemWeight = (item.product?.case_weight || 0) * caseQty;
      return sum + itemWeight;
    }, 0);
    
    addText(`Cases: ${totalCases}`, totalsX, totalsY, { fontSize: 8 });
    totalsY += 4;
    addText(`Units: ${totalUnits}`, totalsX, totalsY, { fontSize: 8 });
    totalsY += 4;
    addText(`Weight: ${totalWeight.toFixed(1)} kg`, totalsX, totalsY, { fontSize: 8 });
    totalsY += 4;
    addText(`Pallets: ${order.number_of_pallets || 'N/A'}`, totalsX, totalsY, { fontSize: 8 });
    
    // Update currentY to the end of the longer column
    currentY = Math.max(notesY, totalsY) + 10;

    pdf.save(`packing-slip-${packingSlip.invoice_number || 'invoice'}.pdf`);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      if (packingSlip) {
        // Update existing packing slip
        const { error } = await supabase
          .from('packing_slips')
          .update({
            invoice_number: editData.invoice_number,
            shipping_method: editData.shipping_method,
            netsuite_reference: editData.netsuite_reference,
            notes: editData.notes,
            contact_name: editData.contact_name,
            contact_email: editData.contact_email,
            contact_phone: editData.contact_phone,
            vat_number: editData.vat_number
          })
          .eq('id', packingSlip.id);

        if (error) throw error;
      } else {
        // Create new packing slip
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found');

        const { error } = await supabase
          .from('packing_slips')
          .insert({
            order_id: orderId,
            invoice_number: editData.invoice_number,
            shipping_method: editData.shipping_method,
            netsuite_reference: editData.netsuite_reference,
            notes: editData.notes,
            contact_name: editData.contact_name,
            contact_email: editData.contact_email,
            contact_phone: editData.contact_phone,
            vat_number: editData.vat_number,
            created_by: user.id
          });

        if (error) throw error;
      }

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

  // Populate editData when packingSlip changes
  useEffect(() => {
    if (packingSlip || order) {
      setEditData({
        invoice_number: order?.invoice_number || packingSlip?.invoice_number || '',
        shipping_method: packingSlip?.shipping_method || '',
        netsuite_reference: order?.so_number || packingSlip?.netsuite_reference || '',
        notes: packingSlip?.notes || '',
        contact_name: packingSlip?.contact_name || '',
        contact_email: packingSlip?.contact_email || '',
        contact_phone: packingSlip?.contact_phone || '',
        vat_number: packingSlip?.vat_number || ''
      });
    }
  }, [packingSlip, order]);

  // Let AdminLayout handle loading - no separate loading state needed

  // Handle loading state - show nothing while data loads (AdminLayout handles main loading)
  if (!order && !error) {
    return null;
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
          <p className="text-gray-600 mb-4">{error || 'The order you are looking for does not exist.'}</p>
          <Link
            href={backUrl}
            className="inline-flex items-center px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            ← Back to Orders
          </Link>
        </div>
      </div>
    );
  }

  // Check if user can edit packing slip (only when order is locked from editing)
  // Open orders cannot create/edit packing slips because the order can still be edited
  const canEdit = ['Ready', 'Done'].includes(order.status);

  // Extract country from company address
  const getDestinationCountry = () => {
    const address = order?.company?.ship_to || '';
    if (!address) return '';
    
    // Try different extraction methods
    const parts = address.split(',').map(part => part.trim());
    
    // If there are multiple parts, take the last one (usually country)
    if (parts.length > 1) {
      return parts[parts.length - 1];
    }
    
    // If only one part, try to extract country from common patterns
    const singlePart = parts[0];
    
    // Look for country patterns at the end
    const countryPatterns = [
      /\b(USA|United States|US)\b/i,
      /\b(Canada|CA)\b/i,
      /\b(United Kingdom|UK|England|Scotland|Wales|Northern Ireland)\b/i,
      /\b(Germany|DE)\b/i,
      /\b(France|FR)\b/i,
      /\b(Spain|ES)\b/i,
      /\b(Italy|IT)\b/i,
      /\b(Netherlands|NL|Holland)\b/i,
      /\b(Belgium|BE)\b/i,
      /\b(Austria|AT)\b/i,
      /\b(Switzerland|CH)\b/i,
      /\b(Sweden|SE)\b/i,
      /\b(Norway|NO)\b/i,
      /\b(Denmark|DK)\b/i,
      /\b(Finland|FI)\b/i,
      /\b(Australia|AU)\b/i,
      /\b(New Zealand|NZ)\b/i,
      /\b(Japan|JP)\b/i,
      /\b(China|CN)\b/i,
      /\b(India|IN)\b/i,
      /\b(Brazil|BR)\b/i,
      /\b(Mexico|MX)\b/i,
      /\b(Argentina|AR)\b/i,
      /\b(Chile|CL)\b/i,
      /\b(Colombia|CO)\b/i,
      /\b(Peru|PE)\b/i,
      /\b(South Korea|KR|Korea)\b/i,
      /\b(Thailand|TH)\b/i,
      /\b(Vietnam|VN)\b/i,
      /\b(Philippines|PH)\b/i,
      /\b(Indonesia|ID)\b/i,
      /\b(Malaysia|MY)\b/i,
      /\b(Singapore|SG)\b/i,
      /\b(Taiwan|TW)\b/i,
      /\b(Hong Kong|HK)\b/i,
      /\b(Israel|IL)\b/i,
      /\b(Turkey|TR)\b/i,
      /\b(Russia|RU)\b/i,
      /\b(Poland|PL)\b/i,
      /\b(Czech Republic|CZ)\b/i,
      /\b(Hungary|HU)\b/i,
      /\b(Romania|RO)\b/i,
      /\b(Bulgaria|BG)\b/i,
      /\b(Greece|GR)\b/i,
      /\b(Portugal|PT)\b/i,
      /\b(Ireland|IE)\b/i,
      /\b(Iceland|IS)\b/i,
      /\b(Luxembourg|LU)\b/i,
      /\b(Liechtenstein|LI)\b/i,
      /\b(Monaco|MC)\b/i,
      /\b(Andorra|AD)\b/i,
      /\b(San Marino|SM)\b/i,
      /\b(Vatican|VA)\b/i,
      /\b(Malta|MT)\b/i,
      /\b(Cyprus|CY)\b/i,
      /\b(Estonia|EE)\b/i,
      /\b(Latvia|LV)\b/i,
      /\b(Lithuania|LT)\b/i,
      /\b(Slovakia|SK)\b/i,
      /\b(Slovenia|SI)\b/i,
      /\b(Croatia|HR)\b/i,
      /\b(Serbia|RS)\b/i,
      /\b(Bosnia|BA)\b/i,
      /\b(Montenegro|ME)\b/i,
      /\b(Macedonia|MK)\b/i,
      /\b(Albania|AL)\b/i,
      /\b(Kosovo|XK)\b/i,
      /\b(Moldova|MD)\b/i,
      /\b(Ukraine|UA)\b/i,
      /\b(Belarus|BY)\b/i,
      /\b(Georgia|GE)\b/i,
      /\b(Armenia|AM)\b/i,
      /\b(Azerbaijan|AZ)\b/i,
      /\b(Kazakhstan|KZ)\b/i,
      /\b(Uzbekistan|UZ)\b/i,
      /\b(Kyrgyzstan|KG)\b/i,
      /\b(Tajikistan|TJ)\b/i,
      /\b(Turkmenistan|TM)\b/i,
      /\b(Mongolia|MN)\b/i,
      /\b(Afghanistan|AF)\b/i,
      /\b(Pakistan|PK)\b/i,
      /\b(Bangladesh|BD)\b/i,
      /\b(Sri Lanka|LK)\b/i,
      /\b(Nepal|NP)\b/i,
      /\b(Bhutan|BT)\b/i,
      /\b(Maldives|MV)\b/i,
      /\b(Myanmar|MM|Burma)\b/i,
      /\b(Cambodia|KH)\b/i,
      /\b(Laos|LA)\b/i,
      /\b(Brunei|BN)\b/i,
      /\b(East Timor|TL|Timor-Leste)\b/i,
      /\b(Papua New Guinea|PG)\b/i,
      /\b(Fiji|FJ)\b/i,
      /\b(Solomon Islands|SB)\b/i,
      /\b(Vanuatu|VU)\b/i,
      /\b(Samoa|WS)\b/i,
      /\b(Tonga|TO)\b/i,
      /\b(Kiribati|KI)\b/i,
      /\b(Tuvalu|TV)\b/i,
      /\b(Nauru|NR)\b/i,
      /\b(Palau|PW)\b/i,
      /\b(Marshall Islands|MH)\b/i,
      /\b(Micronesia|FM)\b/i,
      /\b(Niue|NU)\b/i,
      /\b(Cook Islands|CK)\b/i,
      /\b(Tokelau|TK)\b/i,
      /\b(American Samoa|AS)\b/i,
      /\b(Guam|GU)\b/i,
      /\b(Northern Mariana Islands|MP)\b/i,
      /\b(Puerto Rico|PR)\b/i,
      /\b(Virgin Islands|VI)\b/i,
      /\b(British Virgin Islands|VG)\b/i,
      /\b(Anguilla|AI)\b/i,
      /\b(Montserrat|MS)\b/i,
      /\b(Guadeloupe|GP)\b/i,
      /\b(Martinique|MQ)\b/i,
      /\b(Saint Lucia|LC)\b/i,
      /\b(Saint Vincent|VC)\b/i,
      /\b(Grenada|GD)\b/i,
      /\b(Dominica|DM)\b/i,
      /\b(Saint Kitts|KN)\b/i,
      /\b(Antigua|AG)\b/i,
      /\b(Barbados|BB)\b/i,
      /\b(Trinidad|TT)\b/i,
      /\b(Jamaica|JM)\b/i,
      /\b(Cuba|CU)\b/i,
      /\b(Haiti|HT)\b/i,
      /\b(Dominican Republic|DO)\b/i,
      /\b(Bahamas|BS)\b/i,
      /\b(Belize|BZ)\b/i,
      /\b(Costa Rica|CR)\b/i,
      /\b(El Salvador|SV)\b/i,
      /\b(Guatemala|GT)\b/i,
      /\b(Honduras|HN)\b/i,
      /\b(Nicaragua|NI)\b/i,
      /\b(Panama|PA)\b/i,
      /\b(Ecuador|EC)\b/i,
      /\b(Venezuela|VE)\b/i,
      /\b(Guyana|GY)\b/i,
      /\b(Suriname|SR)\b/i,
      /\b(Uruguay|UY)\b/i,
      /\b(Paraguay|PY)\b/i,
      /\b(Bolivia|BO)\b/i,
      /\b(Egypt|EG)\b/i,
      /\b(Libya|LY)\b/i,
      /\b(Tunisia|TN)\b/i,
      /\b(Algeria|DZ)\b/i,
      /\b(Morocco|MA)\b/i,
      /\b(Sudan|SD)\b/i,
      /\b(South Sudan|SS)\b/i,
      /\b(Ethiopia|ET)\b/i,
      /\b(Eritrea|ER)\b/i,
      /\b(Djibouti|DJ)\b/i,
      /\b(Somalia|SO)\b/i,
      /\b(Kenya|KE)\b/i,
      /\b(Uganda|UG)\b/i,
      /\b(Tanzania|TZ)\b/i,
      /\b(Rwanda|RW)\b/i,
      /\b(Burundi|BI)\b/i,
      /\b(Central African Republic|CF)\b/i,
      /\b(Chad|TD)\b/i,
      /\b(Niger|NE)\b/i,
      /\b(Mali|ML)\b/i,
      /\b(Burkina Faso|BF)\b/i,
      /\b(Ivory Coast|CI)\b/i,
      /\b(Ghana|GH)\b/i,
      /\b(Togo|TG)\b/i,
      /\b(Benin|BJ)\b/i,
      /\b(Nigeria|NG)\b/i,
      /\b(Cameroon|CM)\b/i,
      /\b(Equatorial Guinea|GQ)\b/i,
      /\b(Gabon|GA)\b/i,
      /\b(Congo|CG)\b/i,
      /\b(Democratic Republic of Congo|CD)\b/i,
      /\b(Angola|AO)\b/i,
      /\b(Zambia|ZM)\b/i,
      /\b(Zimbabwe|ZW)\b/i,
      /\b(Botswana|BW)\b/i,
      /\b(Namibia|NA)\b/i,
      /\b(South Africa|ZA)\b/i,
      /\b(Lesotho|LS)\b/i,
      /\b(Swaziland|SZ)\b/i,
      /\b(Madagascar|MG)\b/i,
      /\b(Mauritius|MU)\b/i,
      /\b(Seychelles|SC)\b/i,
      /\b(Comoros|KM)\b/i,
      /\b(Mauritania|MR)\b/i,
      /\b(Senegal|SN)\b/i,
      /\b(Gambia|GM)\b/i,
      /\b(Guinea-Bissau|GW)\b/i,
      /\b(Guinea|GN)\b/i,
      /\b(Sierra Leone|SL)\b/i,
      /\b(Liberia|LR)\b/i,
      /\b(Cape Verde|CV)\b/i,
      /\b(São Tomé|ST)\b/i,
      /\b(Malawi|MW)\b/i,
      /\b(Mozambique|MZ)\b/i
    ];
    
    for (const pattern of countryPatterns) {
      const match = singlePart.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    // If no country pattern found, return the last word (might be a country)
    const words = singlePart.split(' ').filter(word => word.length > 0);
    return words[words.length - 1] || '';
  };


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
               onClick={() => setEditMode(true)}
               className="bg-gray-600 text-white px-4 py-2 rounded transition hover:bg-gray-700 focus:ring-2 focus:ring-gray-500 font-sans text-sm"
             >
               {packingSlip ? 'Edit Packing Slip' : 'Create Packing Slip'}
             </button>
           )}
         </div>

        {/* Single Block Layout */}
        <Card>
          {!packingSlip ? (
            <div className="px-6 py-8 text-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 font-sans">No Packing Slip Found</h2>
              <p className="text-gray-600 mb-2 font-sans">This order doesn't have a packing slip yet. Click "Create" to generate one.</p>
              <p className="text-sm text-gray-500 mb-6 font-sans">Current order status: <span className="font-semibold">{order.status}</span></p>
              {canEdit ? (
                <button
                  onClick={() => setEditMode(true)}
                  className="bg-black text-white px-6 py-3 rounded transition hover:opacity-90 focus:ring-2 focus:ring-gray-900 font-sans"
                >
                  Create Packing Slip
                </button>
              ) : (
                <div className="text-gray-500 font-sans">
                  <p className="mb-2">Cannot create packing slip for orders with status: <span className="font-semibold">{order.status}</span></p>
                  {order.status === 'Open' ? (
                    <p className="text-sm">Open and In Process orders cannot have packing slips because they can still be edited. Packing slips are only available for locked orders (Ready or Done).</p>
                  ) : (
                    <p className="text-sm">Packing slips can only be created for orders with status: Ready or Done.</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div id="packing-slip-content" className="px-6 py-8 space-y-8">
            {/* Header Section */}
            <div className="border-b border-[#e5e5e5] pb-8">
              {/* Two Column Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Left Column */}
                <div>
                  {/* Logo */}
                  <div className="mb-4">
                    <img 
                      src="/QIQI-Logo.svg" 
                      alt="QIQI Logo" 
                      className="h-12 w-auto"
                    />
                  </div>
                  
                  {/* Subsidiary Info */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2 font-sans text-lg">
                      {order.company?.subsidiary?.name || 'N/A'}
                    </h3>
                    <p className="text-gray-600 font-sans text-sm leading-relaxed">
                      {order.company?.subsidiary?.ship_from_address || 'N/A'}
                    </p>
                  </div>
                </div>

                {/* Right Column */}
                <div className="text-right">
                  <div className="text-left inline-block">
                    <h4 className="font-bold text-gray-900 mb-2 font-sans text-lg">SHIP TO:</h4>
                    <h3 className="font-normal text-gray-900 mb-2 font-sans text-lg">
                      {order.company?.company_name || 'N/A'}
                    </h3>
                    <p className="font-normal text-gray-600 font-sans text-sm leading-relaxed">
                      {order.company?.ship_to || 'N/A'}
                    </p>
                    
                    {/* Contact fields - only display if they exist */}
                    {packingSlip?.contact_name && (
                      <p className="font-normal text-gray-600 font-sans text-sm mt-1">
                        Contact: {packingSlip.contact_name}
                      </p>
                    )}
                    {packingSlip?.contact_email && (
                      <p className="font-normal text-gray-600 font-sans text-sm">
                        Email: {packingSlip.contact_email}
                      </p>
                    )}
                    {packingSlip?.contact_phone && (
                      <p className="font-normal text-gray-600 font-sans text-sm">
                        Phone: {packingSlip.contact_phone}
                      </p>
                    )}
                    {packingSlip?.vat_number && (
                      <p className="font-normal text-gray-600 font-sans text-sm">
                        VAT #: {packingSlip.vat_number}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Title and Date Row */}
              <div className="flex justify-between items-center mb-8">
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 border-b border-[#e5e5e5] pb-8">
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Destination Country</label>
                <div className="text-lg font-semibold text-gray-900 font-sans">{getDestinationCountry()}</div>
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
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 font-sans">{totalWeight.toFixed(1)} kg</td>
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
                    <div className="text-sm text-gray-900 font-sans">Pallets: {order.number_of_pallets || 'N/A'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Notes - Always show */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3 font-sans">Notes</h3>
              <div className="bg-gray-50 p-4 rounded-lg border border-[#e5e5e5]">
                {packingSlip.notes ? (
                  <p className="text-gray-700 font-sans text-sm">{packingSlip.notes}</p>
                ) : (
                  <p className="text-gray-500 font-sans text-sm italic">No additional notes</p>
                )}
              </div>
            </div>
          </div>
          )}
        </Card>

        {/* Edit Form Modal */}
        {editMode && canEdit && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-lg font-semibold text-gray-900 font-sans">
                    {packingSlip ? 'Edit Packing Slip' : 'Create Packing Slip'}
                  </h2>
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
                    <label className="block text-sm font-medium text-gray-500 mb-2 font-sans">Invoice Number</label>
                    <input
                      type="text"
                      value={editData.invoice_number}
                      onChange={(e) => setEditData(prev => ({ ...prev, invoice_number: e.target.value }))}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed font-sans text-sm"
                      placeholder="Retrieved from Order Details"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Shipping Method</label>
                    <select
                      value={editData.shipping_method}
                      onChange={(e) => setEditData(prev => ({ ...prev, shipping_method: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    >
                      <option value="">Select shipping method</option>
                      <option value="Air">Air</option>
                      <option value="Ocean">Ocean</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-2 font-sans">QIQI Sales Order</label>
                    <input
                      type="text"
                      value={editData.netsuite_reference}
                      onChange={(e) => setEditData(prev => ({ ...prev, netsuite_reference: e.target.value }))}
                      disabled
                      className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed font-sans text-sm"
                      placeholder="Retrieved from Order Details"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Contact Name</label>
                    <input
                      type="text"
                      value={editData.contact_name}
                      onChange={(e) => setEditData(prev => ({ ...prev, contact_name: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter contact name"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Contact Email</label>
                    <input
                      type="email"
                      value={editData.contact_email}
                      onChange={(e) => setEditData(prev => ({ ...prev, contact_email: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter contact email"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Contact Phone Number</label>
                    <input
                      type="tel"
                      value={editData.contact_phone}
                      onChange={(e) => setEditData(prev => ({ ...prev, contact_phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter contact phone number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">VAT #</label>
                    <input
                      type="text"
                      value={editData.vat_number}
                      onChange={(e) => setEditData(prev => ({ ...prev, vat_number: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                      placeholder="Enter VAT number"
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
                    {saving ? 'Saving...' : (packingSlip ? 'Save Changes' : 'Create Packing Slip')}
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}
    </div>
  );
}
