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
    const sliId = params.id;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Fetch SLI HTML
    const htmlResponse = await fetch(`${request.nextUrl.origin}/api/sli/${sliId}/html`);
    if (!htmlResponse.ok) {
      return NextResponse.json({ error: 'Failed to fetch SLI HTML' }, { status: 500 });
    }
    const html = await htmlResponse.text();

    // Launch Puppeteer with Chromium for serverless
    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
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

    // Get SLI number for filename
    const { data: sli } = await supabaseAdmin
      .from('standalone_slis')
      .select('sli_number')
      .eq('id', sliId)
      .single();

    const filename = sli?.sli_number ? `SLI-${sli.sli_number}.pdf` : `SLI-${sliId.substring(0, 8)}.pdf`;

    // Return PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
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

