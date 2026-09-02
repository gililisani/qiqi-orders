import { NextRequest, NextResponse } from 'next/server';
import { sendMail } from '../../../../lib/emailService';
import { escapeHtml } from '../../../../lib/htmlEscape';
import { emailWrapper, emailHeading, emailFactCard } from '../../../../lib/emailTemplates';
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
    const screenshot = formData.get('screenshot') as File | null;

    if (!textRaw || !typeRaw) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (typeRaw !== 'issue' && typeRaw !== 'feedback') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }
    const type = typeRaw as 'issue' | 'feedback';

    const text = textRaw.slice(0, MAX_TEXT_LENGTH);

    // Sender identity comes from the SESSION, never the form — a logged-in
    // user could otherwise make the internal email claim to be anyone.
    const profileTable = user.roles.includes('admin') ? 'admins' : 'clients';
    const { data: profile } = await supabaseAdmin
      .from(profileTable)
      .select('name, email')
      .eq('id', user.id)
      .maybeSingle();
    const userName = (profile?.name || 'Unknown').trim().slice(0, MAX_NAME_LENGTH);
    const userEmail = (profile?.email || '').trim().slice(0, 320);

    // Strip CR/LF from any field that lands in the subject line (header injection defense).
    const subjectName = userName.replace(/[\r\n]+/g, ' ');
    const subject = type === 'issue'
      ? `[${subjectName}] sent an issue!`
      : `[${subjectName}] is sharing a feedback!`;

    const safeName = escapeHtml(userName);
    const safeEmail = escapeHtml(userEmail);
    const safeText = escapeHtml(text);

    const screenshotBlock = screenshot
      ? `
      <p style="margin:16px 0 8px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;color:#78716C;">Screenshot</p>
      <div><img src="SCREENSHOT_PLACEHOLDER" style="max-width:100%;border:1px solid #E7E5E4;border-radius:8px;" alt="Screenshot" /></div>`
      : '';

    let htmlBody = emailWrapper(
      `
      ${emailHeading(type === 'issue' ? 'Issue report' : 'Feedback', `From ${safeName}`)}
      ${emailFactCard([
        { label: 'From', value: safeName },
        { label: 'Email', value: safeEmail || '—' },
      ])}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#FAFAF9;border-left:3px solid #111111;border-radius:0 6px 6px 0;margin:16px 0 4px;">
        <tr><td style="padding:16px 20px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#44403C;white-space:pre-wrap;">${safeText}</td></tr>
      </table>
      ${screenshotBlock}
      `,
      { footerNote: `Submitted via the Qiqi Partners Hub ${type === 'issue' ? 'issue' : 'feedback'} form.` },
    );

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
          '<div><img src="SCREENSHOT_PLACEHOLDER" style="max-width:100%;border:1px solid #E7E5E4;border-radius:8px;" alt="Screenshot" /></div>',
          '<p style="color:#78716C;">Screenshot failed to process</p>'
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
