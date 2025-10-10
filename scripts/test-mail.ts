#!/usr/bin/env node
/**
 * Test Email Script
 * 
 * Usage: npx tsx scripts/test-mail.ts [recipient-email]
 * 
 * This script sends a test email using the same email service
 * that the application uses for order notifications.
 */

import dotenv from 'dotenv';
import { sendMail } from '../lib/emailService';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

async function testEmail() {
  // Get recipient from command line argument or use TEST_RECIPIENT env var
  const recipient = process.argv[2] || process.env.TEST_RECIPIENT;

  if (!recipient) {
    console.error('❌ Error: No recipient email provided');
    console.error('');
    console.error('Usage: npx ts-node scripts/test-mail.ts <recipient-email>');
    console.error('Or set TEST_RECIPIENT environment variable');
    process.exit(1);
  }

  console.log('📧 Sending test email...');
  console.log(`   To: ${recipient}`);
  console.log(`   From: ${process.env.SMTP_FROM || 'orders@qiqiglobal.com'}`);
  console.log('');

  try {
    const result = await sendMail({
      to: recipient,
      subject: 'Test Email - Qiqi Orders System',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e293b; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; }
            .success { color: #059669; font-weight: bold; }
            .info { background-color: #e0f2fe; padding: 15px; border-left: 4px solid #0284c7; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Test Email Successful</h1>
            </div>
            <div class="content">
              <p><strong class="success">Congratulations!</strong> Your email system is configured correctly.</p>
              
              <div class="info">
                <p><strong>Test Details:</strong></p>
                <ul>
                  <li>Sent via Microsoft 365 SMTP with OAuth</li>
                  <li>Sender: ${process.env.SMTP_FROM || 'orders@qiqiglobal.com'}</li>
                  <li>Timestamp: ${new Date().toISOString()}</li>
                </ul>
              </div>
              
              <p>Your Qiqi Orders email notification system is ready to send automated order emails!</p>
              
              <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 14px;">
                This is an automated test message from the Qiqi Orders System.
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    if (result.success) {
      console.log('✅ Email sent successfully!');
      console.log(`   Message ID: ${result.messageId}`);
      console.log('');
      console.log('🎉 Your email system is working correctly!');
    } else {
      console.error('❌ Failed to send email:');
      console.error(`   ${result.error}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error('❌ Unexpected error:');
    console.error(`   ${error.message}`);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
testEmail();
