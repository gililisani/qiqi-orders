/**
 * Test Email Script
 * 
 * CLI tool to test SMTP email sending via OAuth
 * 
 * Usage:
 *   npx ts-node scripts/test-mail.ts your-email@example.com
 */

import { sendTestEmail } from '../lib/emailService';

async function main() {
  const args = process.argv.slice(2);
  const testRecipient = args[0] || process.env.TEST_RECIPIENT;

  if (!testRecipient) {
    console.error('❌ Error: No recipient email provided');
    console.log('\nUsage:');
    console.log('  npx ts-node scripts/test-mail.ts your-email@example.com');
    console.log('  Or set TEST_RECIPIENT environment variable');
    process.exit(1);
  }

  console.log('🚀 Testing SMTP Email Configuration...\n');
  console.log(`📧 Sending test email to: ${testRecipient}`);
  console.log('⏳ Please wait...\n');

  try {
    const result = await sendTestEmail(testRecipient);
    
    console.log('✅ Email sent successfully!');
    console.log(`📨 Message ID: ${result.messageId}`);
    console.log(`📬 Sent to: ${testRecipient}`);
    console.log('\n✨ SMTP configuration is working correctly!');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Failed to send test email:\n');
    console.error(error.message);
    
    console.log('\n🔍 Troubleshooting Tips:');
    console.log('1. Verify environment variables are set correctly:');
    console.log('   - AZURE_TENANT_ID');
    console.log('   - AZURE_CLIENT_ID');
    console.log('   - AZURE_CLIENT_SECRET');
    console.log('2. Check that the Azure App has SMTP.SendAsApp permission');
    console.log('3. Verify admin consent has been granted for the application');
    console.log('4. Ensure orders@qiqiglobal.com allows authenticated SMTP');
    
    process.exit(1);
  }
}

main();

