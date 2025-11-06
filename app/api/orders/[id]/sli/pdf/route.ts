import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  let browser;
  try {
    const orderId = params.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Get auth token from request
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');

    // Fetch SLI HTML
    const htmlResponse = await fetch(`${request.nextUrl.origin}/api/orders/${orderId}/sli/html`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    if (!htmlResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch SLI HTML' }, { status: 500 });
    }
    
    const { html } = await htmlResponse.json();

    // Launch Puppeteer with Chromium for serverless
    const isProduction = process.env.VERCEL || process.env.NODE_ENV === 'production';
    
    let executablePath: string | undefined;
    let launchArgs: string[];
    
    if (isProduction) {
      try {
        // Ensure fonts are available
        await chromium.font();
        executablePath = await chromium.executablePath();
        launchArgs = chromium.args;
      } catch (error) {
        console.error('Error setting up Chromium:', error);
        // Fallback: try with minimal args
        executablePath = undefined;
        launchArgs = [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ];
      }
    } else {
      // Development: use system Chrome if available
      executablePath = undefined;
      launchArgs = ['--no-sandbox', '--disable-setuid-sandbox'];
    }
    
    browser = await puppeteer.launch({
      args: launchArgs,
      executablePath,
      headless: true,
    });

    const page = await browser.newPage();
    
    // Set content and wait for it to load
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Generate PDF with professional settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm',
      },
    });

    await browser.close();

    // Get order info for filename
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('invoice_number, so_number')
      .eq('id', orderId)
      .single();

    const filename = order?.invoice_number || order?.so_number || orderId.substring(0, 8);
    const pdfFilename = `SLI-${filename}.pdf`;

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdfFilename}"`,
      },
    });

  } catch (error: any) {
    console.error('Error generating PDF:', error);
    if (browser) {
      await browser.close();
    }
    return NextResponse.json({ error: error.message || 'Failed to generate PDF' }, { status: 500 });
  }
}

