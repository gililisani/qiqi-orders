import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const type = formData.get('type') as string;
    const text = formData.get('text') as string;
    const userName = formData.get('userName') as string;
    const userEmail = formData.get('userEmail') as string;
    const screenshot = formData.get('screenshot') as File | null;

    if (!text || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
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
      const buffer = await screenshot.arrayBuffer();
      attachments.push({
        filename: screenshot.name,
        content: Buffer.from(buffer),
      });
      htmlBody += `<p><em>Screenshot attached</em></p>`;
    }

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

    // Send email
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'noreply@qiqiglobal.com',
      to: 'orders@qiqiglobal.com',
      subject: subject,
      html: htmlBody,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending feedback:', error);
    return NextResponse.json({ error: error.message || 'Failed to send feedback' }, { status: 500 });
  }
}

