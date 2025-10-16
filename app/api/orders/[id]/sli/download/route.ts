import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const orderId = params.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get current user (admin only for download)
    // Try to get token from query params (for direct download link)
    const url = new URL(request.url);
    let token = url.searchParams.get('token');
    
    // Fallback to Authorization header
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader) {
        token = authHeader.replace('Bearer ', '');
      }
    }
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify user is admin
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('admins')
      .select('id')
      .eq('id', user.id)
      .single();

    if (adminError || !admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Fetch SLI data
    const { data: sli, error: sliError } = await supabaseAdmin
      .from('slis')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (sliError || !sli) {
      return NextResponse.json({ error: 'SLI not found for this order' }, { status: 404 });
    }

    // Fetch order data
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        invoice_number,
        company_id,
        companies (
          company_name,
          ship_to_street_line_1,
          ship_to_street_line_2,
          ship_to_city,
          ship_to_state,
          ship_to_postal_code,
          ship_to_country
        )
      `)
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Fetch order items with product details
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select(`
        id,
        quantity,
        case_qty,
        total_price,
        product_id
      `)
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true, nullsFirst: false });

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return NextResponse.json({ error: 'Failed to fetch order items', details: itemsError.message }, { status: 500 });
    }

    // Fetch products separately
    const productIds = (orderItems || []).map((item: any) => item.product_id);
    const { data: products, error: productsError } = await supabaseAdmin
      .from('Products')
      .select('id, hs_code, case_weight, item_name')
      .in('id', productIds);

    if (productsError) {
      console.error('Error fetching products:', productsError);
      return NextResponse.json({ error: 'Failed to fetch products', details: productsError.message }, { status: 500 });
    }

    // Map products to items
    const productsMap = new Map(products?.map((p: any) => [p.id, p]) || []);
    const itemsWithProducts = (orderItems || []).map((item: any) => ({
      ...item,
      product: productsMap.get(item.product_id)
    }));

    // Create PDF document
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 size in points
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontSize = 8;
    const { width, height } = page.getSize();
    
    let yPosition = height - 40;

    // Helper function to draw text
    const drawText = (text: string, x: number, y: number, size = fontSize, isBold = false) => {
      page.drawText(text, {
        x,
        y,
        size,
        font: isBold ? fontBold : font,
        color: rgb(0, 0, 0),
      });
    };

    // Helper function to draw box
    const drawBox = (x: number, y: number, w: number, h: number) => {
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
      });
    };

    // Title
    drawText("SHIPPER'S LETTER OF INSTRUCTION (SLI)", width / 2 - 120, yPosition, 12, true);
    yPosition -= 30;

    // Box 1: USPPI Name
    drawBox(40, yPosition - 20, 150, 30);
    drawText('1. USPPI Name:', 45, yPosition - 10, 7);
    drawText('Qiqi INC', 45, yPosition - 20, 8);
    
    // Box 3: Freight Location
    drawBox(200, yPosition - 20, 150, 30);
    drawText('3. Freight Location Co Name:', 205, yPosition - 10, 7);
    drawText('PACKABLE / Webb Enterprises', 205, yPosition - 20, 8);
    
    // Box 5: Forwarding Agent
    drawBox(360, yPosition - 20, 150, 30);
    drawText('5. Forwarding Agent:', 365, yPosition - 10, 7);
    drawText(sli.forwarding_agent_line1 || '', 365, yPosition - 20, 7);
    
    yPosition -= 40;

    // Box 2: USPPI Address
    drawBox(40, yPosition - 30, 150, 40);
    drawText('2. USPPI Address:', 45, yPosition - 10, 7);
    drawText('4625 West Nevso Drive, Suite 2', 45, yPosition - 18, 7);
    drawText('Las Vegas, NV 89103', 45, yPosition - 26, 7);
    drawText('United States', 45, yPosition - 34, 7);
    
    // Box 4: Freight Location Address
    drawBox(200, yPosition - 30, 150, 40);
    drawText('4. Freight Location Address:', 205, yPosition - 10, 7);
    drawText('1516 Motor Parkway', 205, yPosition - 18, 7);
    drawText('Islandia, New York, 11749', 205, yPosition - 26, 7);
    drawText('United States', 205, yPosition - 34, 7);
    
    // Box 6: Date of Export
    const today = new Date().toLocaleDateString('en-US');
    drawBox(360, yPosition - 15, 150, 20);
    drawText('6. Date of Export:', 365, yPosition - 10, 7);
    drawText(today, 365, yPosition - 18, 7);
    
    yPosition -= 50;

    // Box 9: USPPI Reference (Invoice Number)
    drawBox(40, yPosition - 15, 150, 20);
    drawText('9. USPPI Reference #:', 45, yPosition - 10, 7);
    drawText(order.invoice_number || '', 45, yPosition - 18, 7);
    
    // Box 8: Related Party Indicator
    drawBox(200, yPosition - 15, 150, 20);
    drawText('8. Related Party: ☐ Related ☑ Non-Related', 205, yPosition - 10, 7);
    
    yPosition -= 30;

    // Box 11: Ultimate Consignee
    const company = order.companies as any;
    drawBox(40, yPosition - 40, 250, 50);
    drawText('11. Ultimate Consignee Name & Address:', 45, yPosition - 10, 7);
    drawText(company?.company_name || '', 45, yPosition - 18, 7);
    drawText(company?.ship_to_street_line_1 || '', 45, yPosition - 26, 7);
    drawText(company?.ship_to_street_line_2 || '', 45, yPosition - 34, 7);
    drawText(`${company?.ship_to_city || ''}, ${company?.ship_to_state || ''}, ${company?.ship_to_postal_code || ''}`, 45, yPosition - 42, 7);
    
    // Box 12: Consignee Type
    drawBox(300, yPosition - 40, 150, 50);
    drawText('12. Consignee Type:', 305, yPosition - 10, 7);
    drawText('☐ Government', 305, yPosition - 18, 7);
    drawText('☐ Direct Consumer', 305, yPosition - 26, 7);
    drawText('☑ Re-Seller', 305, yPosition - 34, 7);
    
    yPosition -= 60;

    // Box 15: Country of Destination
    drawBox(40, yPosition - 15, 150, 20);
    drawText('15. Country of Ultimate Destination:', 45, yPosition - 10, 7);
    drawText(company?.ship_to_country || '', 45, yPosition - 18, 7);
    
    // Box 16: Hazardous Material
    drawBox(200, yPosition - 15, 150, 20);
    drawText('16. Hazardous Material: ☐ Yes ☑ No', 205, yPosition - 10, 7);
    
    // Box 17: In-Bond Code
    drawBox(360, yPosition - 15, 150, 20);
    drawText('17. In-Bond Code:', 365, yPosition - 10, 7);
    drawText(sli.in_bond_code || '', 365, yPosition - 18, 7);
    
    yPosition -= 30;

    // Box 26: Instructions to Forwarder
    drawBox(40, yPosition - 20, 470, 30);
    drawText('26. Instructions to Forwarder:', 45, yPosition - 10, 7);
    drawText(sli.instructions_to_forwarder || '', 45, yPosition - 20, 7);
    
    yPosition -= 40;

    // Product Table Header
    drawText('Products:', 40, yPosition, 8, true);
    yPosition -= 15;
    
    const colWidths = [30, 80, 40, 40, 40, 40, 30, 60, 60, 50];
    const headers = ['D/F', 'HS Code', 'Qty', 'UOM', 'Weight(kg)', 'ECCN', 'SME', 'License', 'Value($)', 'Lic.Value'];
    
    let xPos = 40;
    headers.forEach((header, i) => {
      drawText(header, xPos, yPosition, 6, true);
      xPos += colWidths[i];
    });
    
    yPosition -= 12;

    // Product rows
    (itemsWithProducts || []).forEach((item: any) => {
      const totalWeight = ((item.case_qty || 0) * (item.product?.case_weight || 0)).toFixed(2);
      const values = [
        'D',
        item.product?.hs_code || '',
        String(item.quantity || 0),
        'Each',
        totalWeight,
        'EAR99',
        '',
        'NLR',
        `$${(item.total_price || 0).toFixed(2)}`,
        ''
      ];
      
      xPos = 40;
      values.forEach((val, i) => {
        drawText(val, xPos, yPosition, 6);
        xPos += colWidths[i];
      });
      
      yPosition -= 10;
    });

    yPosition -= 20;

    // Box 40: Authorization
    drawBox(40, yPosition - 20, 470, 25);
    drawText('40. ☑ USPPI authorizes forwarder to act as authorized agent', 45, yPosition - 12, 7);
    
    yPosition -= 30;

    // Box 42-43: Contact Info
    drawBox(40, yPosition - 15, 200, 20);
    drawText('42. USPPI Email: aaron@qiqiglobal.com', 45, yPosition - 10, 7);
    
    drawBox(250, yPosition - 15, 200, 20);
    drawText('43. Phone: 00972-54-6248884', 255, yPosition - 10, 7);
    
    yPosition -= 25;

    // Box 44: Printed Name
    drawBox(40, yPosition - 15, 200, 20);
    drawText('44. Printed Name: Aaron Lisani', 45, yPosition - 10, 7);
    
    // Box 46: Title
    drawBox(250, yPosition - 15, 100, 20);
    drawText('46. Title: CPO', 255, yPosition - 10, 7);
    
    // Box 47: Date
    drawBox(360, yPosition - 15, 150, 20);
    drawText('47. Date:', 365, yPosition - 10, 7);
    drawText(today, 365, yPosition - 18, 7);
    
    yPosition -= 25;

    // Box 48: Electronic Signature
    drawBox(40, yPosition - 15, 470, 20);
    drawText('48. ☑ Validate Electronic Signature', 45, yPosition - 10, 7);

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    // Return PDF as download
    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="SLI-${order.invoice_number || orderId}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error('Error generating SLI PDF:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
