import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    console.log('Feedback submission started');
    
    const formData = await request.formData();
    const type = formData.get('type') as string;
    const text = formData.get('text') as string;
    const userName = formData.get('userName') as string;
    const userEmail = formData.get('userEmail') as string;
    const screenshot = formData.get('screenshot') as File | null;

    console.log('Received data:', { type, userName, userEmail, hasScreenshot: !!screenshot });

    if (!text || !type) {
      console.error('Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Check if SMTP is configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.error('SMTP not configured. Missing SMTP_USER or SMTP_PASS environment variables.');
      
      // For now, just log the feedback instead of sending email
      console.log('=== FEEDBACK RECEIVED (NOT SENT VIA EMAIL) ===');
      console.log(`Type: ${type}`);
      console.log(`From: ${userName} (${userEmail})`);
      console.log(`Message: ${text}`);
      console.log(`Screenshot: ${screenshot ? screenshot.name : 'None'}`);
      console.log('===========================================');
      
      // Return success anyway so users aren't blocked
      return NextResponse.json({ 
        success: true,
        warning: 'Email not configured - feedback logged to console'
      });
    }

    // Prepare email subject
    const subject = type === 'issue' 
      ? `[${userName}] sent an issue!`
      : `[${userName}] is sharing a feedback!`;

    // Prepare email body
    let htmlBody = `
      <h2>${type === 'issue' ? 'Issue Report' : 'Feedback'}</h2>
      <p><strong>From:</strong> ${userName} (${userEmail})</p>
      <p><strong>Message:</strong></p>
      <p>${text.replace(/\n/g, '<br>')}</p>
    `;

    // Handle screenshot attachment
    const attachments: any[] = [];
    if (screenshot && type === 'issue') {
      try {
        const buffer = await screenshot.arrayBuffer();
        attachments.push({
          filename: screenshot.name,
          content: Buffer.from(buffer),
        });
        htmlBody += `<p><em>Screenshot attached</em></p>`;
      } catch (err) {
        console.error('Error processing screenshot:', err);
        htmlBody += `<p><em>Screenshot failed to attach</em></p>`;
      }
    }

    console.log('Creating SMTP transporter...');
    
    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    console.log('Sending email...');

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@qiqiglobal.com',
      to: 'orders@qiqiglobal.com',
      subject: subject,
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    console.log('Email sent successfully');

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending feedback:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json({ 
      error: error.message || 'Failed to send feedback',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}

