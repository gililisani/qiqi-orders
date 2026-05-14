import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { escapeHtml } from '../../../../lib/htmlEscape';
import { createServiceRoleClient, requireAuthenticatedUser } from '../../../../platform/auth/guards';
import { enforceRateLimit, getClientIp } from '../../../../platform/rateLimit';

const MAX_TEXT_LENGTH = 5000;
const MAX_NAME_LENGTH = 200;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_SCREENSHOT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const FEEDBACK_RATE = { limit: 10, windowSeconds: 3600 } as const;

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(request);

    const supabaseAdmin = createServiceRoleClient();
    const ip = getClientIp(request);
    const rl = await enforceRateLimit(supabaseAdmin, {
      key: `feedback:user:${user.id}:ip:${ip}`,
      limit: FEEDBACK_RATE.limit,
      windowSeconds: FEEDBACK_RATE.windowSeconds,
    });
    if (!rl.ok) return rl.response;

    const formData = await request.formData();
    const typeRaw = String(formData.get('type') ?? '');
    const textRaw = String(formData.get('text') ?? '');
    const userNameRaw = String(formData.get('userName') ?? '');
    const userEmailRaw = String(formData.get('userEmail') ?? '');
    const screenshot = formData.get('screenshot') as File | null;

    if (!textRaw || !typeRaw) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeRaw !== 'issue' && typeRaw !== 'feedback') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    const type = typeRaw as 'issue' | 'feedback';

    const text = textRaw.slice(0, MAX_TEXT_LENGTH);
    const userName = userNameRaw.trim().slice(0, MAX_NAME_LENGTH) || 'Unknown';
    const userEmail = userEmailRaw.trim().slice(0, 320);

    // Strip CR/LF from any field that lands in the subject line (header injection defense).
    const subjectName = userName.replace(/[\r\n]+/g, ' ');
    const subject = type === 'issue'
      ? `[${subjectName}] sent an issue!`
      : `[${subjectName}] is sharing a feedback!`;

    const safeName = escapeHtml(userName);
    const safeEmail = escapeHtml(userEmail);
    const safeText = escapeHtml(text);

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
          <tr>
            <td style="background-color: ${type === 'issue' ? '#fee2e2' : '#dbeafe'}; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; color: ${type === 'issue' ? '#991b1b' : '#1e40af'};">
                ${type === 'issue' ? '🐛 Issue Report' : '💡 User Feedback'}
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 20px; background-color: #f9fafb; border-radius: 6px; padding: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;"><strong>From:</strong> ${safeName}</p>
                    <p style="margin: 0; color: #6b7280; font-size: 14px;"><strong>Email:</strong> ${safeEmail}</p>
                  </td>
                </tr>
              </table>
              <h2 style="margin: 0 0 15px; font-size: 18px; color: #111827;">Message:</h2>
              <div style="background-color: #f9fafb; border-left: 4px solid ${type === 'issue' ? '#ef4444' : '#3b82f6'}; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
                <p style="margin: 0; color: #374151; font-size: 16px; line-height: 1.6; white-space: pre-wrap;">${safeText}</p>
              </div>
              ${screenshot ? '<p style="margin: 20px 0 10px; color: #6b7280; font-size: 14px;"><strong>📎 Screenshot:</strong></p>' : ''}
              ${screenshot ? '<div style="margin-top: 10px;"><img src="SCREENSHOT_PLACEHOLDER" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Screenshot" /></div>' : ''}
            </td>
          </tr>
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

    if (screenshot && type === 'issue') {
      const mimeType = screenshot.type || '';
      if (!ALLOWED_SCREENSHOT_TYPES.has(mimeType)) {
        return NextResponse.json({ error: 'Unsupported screenshot type' }, { status: 400 });
      }
      if (screenshot.size > MAX_SCREENSHOT_BYTES) {
        return NextResponse.json({ error: 'Screenshot exceeds 5 MB limit' }, { status: 400 });
      }
      try {
        const buffer = await screenshot.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;
        htmlBody = htmlBody.replace('SCREENSHOT_PLACEHOLDER', dataUrl);
      } catch (err) {
        console.error('[FEEDBACK] Error processing screenshot:', err);
        htmlBody = htmlBody.replace(
          '<div style="margin-top: 10px;"><img src="SCREENSHOT_PLACEHOLDER" style="max-width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;" alt="Screenshot" /></div>',
          '<p style="color: #ef4444;">Screenshot failed to process</p>'
        );
      }
    }

    const result = await sendMail({
      to: 'orders@qiqiglobal.com',
      subject,
      html: htmlBody,
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send email');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[FEEDBACK] Error sending feedback:', error?.message);
    return NextResponse.json(
      { error: error?.message || 'Failed to send feedback' },
      { status: 500 }
    );
  }
}
