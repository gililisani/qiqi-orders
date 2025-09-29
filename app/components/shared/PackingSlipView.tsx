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
    notes: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    vat_number: ''
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
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!order || !orderItems || !packingSlip) return;

    // Landscape orientation with narrow margins
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageWidth = 297; // Landscape A4 width
    const pageHeight = 210; // Landscape A4 height
    const margin = 10; // Narrow margins
    let yPosition = margin;

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
      pdf.text(text, x, y);
    };

    // Helper function to add line
    const addLine = (x1: number, y1: number, x2: number, y2: number, color = [229, 229, 229]) => {
      pdf.setDrawColor(color[0], color[1], color[2]);
      pdf.line(x1, y1, x2, y2);
    };

    // Helper function to add table header
    const addTableHeader = (headers: string[], startY: number) => {
      const colWidths = [80, 35, 25, 25, 30, 35, 35]; // Adjusted for landscape
      let xPos = margin;
      
      headers.forEach((header, index) => {
        addText(header, xPos, startY, { fontSize: 8, fontStyle: 'bold', color: [75, 85, 99] });
        xPos += colWidths[index];
      });
      
      // Header line
      addLine(margin, startY + 2, pageWidth - margin, startY + 2);
      return startY + 8;
    };

    // Helper function to add table row
    const addTableRow = (data: string[], startY: number) => {
      const colWidths = [80, 35, 25, 25, 30, 35, 35];
      let xPos = margin;
      
      data.forEach((cell, index) => {
        const maxWidth = colWidths[index] - 2;
        const lines = pdf.splitTextToSize(cell, maxWidth);
        
        lines.forEach((line: string, lineIndex: number) => {
          addText(line, xPos, startY + (lineIndex * 4), { fontSize: 8 });
        });
        
        xPos += colWidths[index];
      });
      
      // Row line
      addLine(margin, startY + 8, pageWidth - margin, startY + 8);
      return startY + 12;
    };

    // Logo (placeholder - you can add actual logo if needed)
    addText('QIQI LOGO', margin, yPosition, { fontSize: 12, fontStyle: 'bold' });
    yPosition += 15;

    // Company Info Row - Left and Right aligned
    const leftInfo = order.company?.subsidiary?.name || 'N/A';
    const leftAddress = order.company?.subsidiary?.ship_from_address || 'N/A';
    
    addText(leftInfo, margin, yPosition, { fontSize: 14, fontStyle: 'bold' });
    yPosition += 6;
    addText(leftAddress, margin, yPosition, { fontSize: 10 });
    yPosition += 15;

    // Right side - SHIP TO
    const shipToY = yPosition - 21; // Align with left side
    addText('SHIP TO:', pageWidth - margin - 100, shipToY, { fontSize: 14, fontStyle: 'bold' });
    addText(order.company?.company_name || 'N/A', pageWidth - margin - 100, shipToY + 6, { fontSize: 14, fontStyle: 'normal' });
    addText(order.company?.ship_to || 'N/A', pageWidth - margin - 100, shipToY + 15, { fontSize: 10, fontStyle: 'normal' });

    // Title and Date Row
    yPosition += 10;
    addText('PACKING SLIP', pageWidth / 2, yPosition, { fontSize: 24, fontStyle: 'bold' });
    addText(`Date: ${new Date().toLocaleDateString()}`, pageWidth - margin - 50, yPosition, { fontSize: 10 });
    yPosition += 15;

    // Bottom border for header section
    addLine(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Invoice Details Row
    const invoiceDetailsY = yPosition;
    addText(`Invoice Number`, margin, invoiceDetailsY, { fontSize: 10, fontStyle: 'bold', color: [75, 85, 99] });
    addText(`#${packingSlip.invoice_number}`, margin, invoiceDetailsY + 6, { fontSize: 14, fontStyle: 'bold' });
    
    addText(`Shipping Method`, margin + 80, invoiceDetailsY, { fontSize: 10, fontStyle: 'bold', color: [75, 85, 99] });
    addText(packingSlip.shipping_method, margin + 80, invoiceDetailsY + 6, { fontSize: 14, fontStyle: 'bold' });
    
    addText(`QIQI Sales Order`, margin + 160, invoiceDetailsY, { fontSize: 10, fontStyle: 'bold', color: [75, 85, 99] });
    addText(packingSlip.netsuite_reference || 'N/A', margin + 160, invoiceDetailsY + 6, { fontSize: 14, fontStyle: 'bold' });
    
    yPosition += 25;

    // Bottom border for invoice details
    addLine(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;

    // Items table
    const headers = ['Item', 'SKU', 'Case Pack', 'Case Qty', 'Total Units', 'Weight', 'HS Code', 'Made In'];
    yPosition = addTableHeader(headers, yPosition);

    // Add items
    orderItems.forEach((item) => {
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

      yPosition = addTableRow(rowData, yPosition);
    });

    // Totals section - positioned to the right
    const totalsX = pageWidth - margin - 120;
    const totalsY = yPosition + 5;
    
    // Horizontal line above totals
    addLine(totalsX, totalsY, pageWidth - margin, totalsY);
    
    addText('TOTALS', totalsX, totalsY + 8, { fontSize: 10, fontStyle: 'bold' });
    
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
    
    addText(`Cases: ${totalCases}`, totalsX, totalsY + 16, { fontSize: 10 });
    addText(`Units: ${totalUnits}`, totalsX, totalsY + 24, { fontSize: 10 });
    addText(`Weight: ${totalWeight.toFixed(1)} kg`, totalsX, totalsY + 32, { fontSize: 10 });

    yPosition += 50;

    // Notes section
    if (packingSlip.notes) {
      if (yPosition > pageHeight - 30) {
        pdf.addPage();
        yPosition = margin;
      }
      
      addText('Notes', margin, yPosition, { fontSize: 14, fontStyle: 'bold' });
      yPosition += 8;
      
      const noteLines = pdf.splitTextToSize(packingSlip.notes, pageWidth - (margin * 2));
      noteLines.forEach((line: string) => {
        addText(line, margin, yPosition, { fontSize: 10 });
        yPosition += 5;
      });
    }

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
          notes: editData.notes,
          contact_name: editData.contact_name,
          contact_email: editData.contact_email,
          contact_phone: editData.contact_phone,
          vat_number: editData.vat_number
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
              {/* Logo and SHIP TO Row */}
              <div className="flex justify-between items-start mb-6">
                {/* Logo */}
                <div>
                  <img 
                    src="/QIQI-Logo.svg" 
                    alt="QIQI Logo" 
                    className="h-12 w-auto"
                  />
                </div>

                {/* SHIP TO - Top Right Corner */}
                <div className="text-left">
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

              {/* Subsidiary Info */}
              <div className="mb-8">
                <h3 className="font-semibold text-gray-900 mb-2 font-sans text-lg">
                  {order.company?.subsidiary?.name || 'N/A'}
                </h3>
                <p className="text-gray-600 font-sans text-sm leading-relaxed">
                  {order.company?.subsidiary?.ship_from_address || 'N/A'}
                </p>
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
