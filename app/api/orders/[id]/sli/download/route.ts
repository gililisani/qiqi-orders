import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateSLIHTML } from '../../../../../../lib/sliGenerator';
import puppeteer from 'puppeteer';

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
        products (
          hs_code,
          case_weight
        )
      `)
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true });

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return NextResponse.json({ error: 'Failed to fetch order items' }, { status: 500 });
    }

    // Prepare data for HTML generation
    const sliData = {
      forwarding_agent_line1: sli.forwarding_agent_line1 || '',
      forwarding_agent_line2: sli.forwarding_agent_line2 || '',
      forwarding_agent_line3: sli.forwarding_agent_line3 || '',
      forwarding_agent_line4: sli.forwarding_agent_line4 || '',
      in_bond_code: sli.in_bond_code || '',
      instructions_to_forwarder: sli.instructions_to_forwarder || '',
      invoice_number: order.invoice_number || '',
      company_name: order.companies?.company_name || '',
      ship_to_street_line_1: order.companies?.ship_to_street_line_1 || '',
      ship_to_street_line_2: order.companies?.ship_to_street_line_2 || '',
      ship_to_city: order.companies?.ship_to_city || '',
      ship_to_state: order.companies?.ship_to_state || '',
      ship_to_postal_code: order.companies?.ship_to_postal_code || '',
      ship_to_country: order.companies?.ship_to_country || '',
      products: (orderItems || []).map((item: any) => ({
        hs_code: item.products?.hs_code || '',
        quantity: item.quantity || 0,
        case_qty: item.case_qty || 0,
        case_weight: item.products?.case_weight || 0,
        total_price: item.total_price || 0,
      })),
      creation_date: new Date().toISOString().split('T')[0],
    };

    // Generate HTML
    const html = generateSLIHTML(sliData);

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Add signature image if exists
    // TODO: When signature is uploaded, insert it here

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '5mm',
        right: '5mm',
        bottom: '5mm',
        left: '5mm',
      },
    });

    await browser.close();

    // Return PDF as download
    return new NextResponse(pdfBuffer, {
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

