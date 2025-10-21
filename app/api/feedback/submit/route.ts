import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';

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

    // Prepare email subject
    const subject = type === 'issue' 
      ? `[${userName}] sent an issue!`
      : `[${userName}] is sharing a feedback!`;

    // Prepare email body
    let htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>User Feedback</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${type === 'issue' ? '#fee2e2' : '#dbeafe'}; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: ${type === 'issue' ? '#991b1b' : '#1e40af'};">
                ${type === 'issue' ? '🐛 Issue Report' : '💡 User Feedback'}
              </h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; background-color: #f9fafb; border-radius: 6px; padding: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>From:</strong> ${userName}</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Email:</strong> ${userEmail}</p>
                  </td>
                </tr>
              </table>
              
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #111827;">Message:</h2>
              <div style="background-color: #f9fafb; border-left: 4px solid ${type === 'issue' ? '#ef4444' : '#3b82f6'}; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
                <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${text}</p>
              </div>
              
              ${screenshot ? '<p style="margin: 20px 0 10px; color: #6b7280; font-size: 14px;"><strong>📎 Screenshot:</strong></p>' : ''}
              ${screenshot ? '<div style="margin-top: 10px;"><img src="SCREENSHOT_PLACEHOLDER" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Screenshot" /></div>' : ''}
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 20px 30px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                This ${type === 'issue' ? 'issue' : 'feedback'} was submitted via Qiqi Partners Portal
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;

    // Convert screenshot to base64 and embed in email
    if (screenshot && type === 'issue') {
      try {
        const buffer = await screenshot.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mimeType = screenshot.type || 'image/png';
        const dataUrl = `data:${mimeType};base64,${base64}`;
        htmlBody = htmlBody.replace('SCREENSHOT_PLACEHOLDER', dataUrl);
        console.log('Screenshot converted to base64 and embedded in email');
      } catch (err) {
        console.error('Error processing screenshot:', err);
        // Remove screenshot placeholder if conversion fails
        htmlBody = htmlBody.replace('<div style="margin-top: 10px;"><img src="SCREENSHOT_PLACEHOLDER" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Screenshot" /></div>', '<p style="color: #ef4444;">Screenshot failed to process</p>');
      }
    }

    console.log('Sending email via Microsoft Graph API...');

    // Send email using existing email service
    const result = await sendMail({
      to: 'orders@qiqiglobal.com',
      subject: subject,
      html: htmlBody,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

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

