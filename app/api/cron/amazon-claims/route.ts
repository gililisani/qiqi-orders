import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '../../../../platform/auth/guards';
import { isAmazonSpConfigured } from '../../../../lib/amazonSp/client';
import { buildClaimsSnapshot } from '../../../../lib/amazonFba/claimableLosses';
import { sendMail } from '../../../../lib/emailService';
import { emailWrapper, emailHeading, emailPara, emailFactCard, emailButton } from '../../../../lib/emailTemplates';
import { escapeHtml } from '../../../../lib/htmlEscape';

// Route-level export — vercel.json maxDuration is NOT honored for Next
// routes (60s-kill incident 2026-08-27). Two Amazon reports must generate.
export const maxDuration = 300;

/**
 * Weekly (Mon 07:00 UTC, vercel.json): compute the FBA claimable-losses
 * snapshot and store it on amazon_fba_config; email the FBA notify address
 * when anything is claimable — Amazon's reimbursement window is 60 days,
 * so this is the alarm that makes disputes possible at all.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    if (!isAmazonSpConfigured()) {
      // Staging has no Amazon on purpose — succeed quietly.
      return NextResponse.json({ success: true, skipped: 'Amazon SP-API not configured' });
    }

    const snapshot = await buildClaimsSnapshot();
    const supabase = createServiceRoleClient();
    const { data: config, error: updateErr } = await supabase
      .from('amazon_fba_config')
      .update({ claims_snapshot: snapshot })
      .eq('id', 1)
      .select('notify_email')
      .single();
    if (updateErr) throw updateErr;

    if (snapshot.rows.length > 0 && config?.notify_email) {
      const facts = snapshot.rows.slice(0, 10).map((r) => ({
        label: `${r.sku}${r.title ? ` — ${r.title.slice(0, 40)}` : ''}`,
        value: `${r.outstanding} unit${r.outstanding === 1 ? '' : 's'} · ${r.daysLeft}d left`,
      }));
      const content =
        emailHeading('Amazon FBA', `${snapshot.totals.outstandingUnits} unit(s) claimable from Amazon`) +
        emailPara(
          `Amazon's ledger shows lost/damaged inventory not yet reimbursed. ` +
            `Claims must be filed within 60 days of the event${
              snapshot.totals.expiringSoon > 0
                ? ` — <strong>${escapeHtml(snapshot.totals.expiringSoon)} SKU(s) expire within 10 days</strong>`
                : ''
            }.`
        ) +
        emailFactCard(facts) +
        emailButton('Review in the Hub', 'https://partners.qiqiglobal.com/admin/netsuite/amazon-fba') +
        emailPara(
          `File the claim in Seller Central (Reimbursements) — Amazon has no API for filing, so this step is manual.`
        );
      await sendMail({
        to: config.notify_email,
        subject: `FBA: ${snapshot.totals.outstandingUnits} unit(s) claimable from Amazon${
          snapshot.totals.expiringSoon > 0 ? ' — window closing' : ''
        }`,
        html: emailWrapper(content, { footerNote: 'Automated weekly check from the Qiqi Partners Hub.' }),
      }).catch((e) => console.error('[cron/amazon-claims] email failed:', String(e?.message ?? e)));
    }

    console.log(
      `[cron/amazon-claims] rows=${snapshot.rows.length} outstanding=${snapshot.totals.outstandingUnits} unknownReasons=${snapshot.unknownReasons.length}`
    );
    return NextResponse.json({ success: true, ...snapshot.totals, rows: snapshot.rows.length });
  } catch (err: any) {
    console.error('[cron/amazon-claims] error:', err);
    return NextResponse.json({ error: err?.message || 'Claims check failed' }, { status: 500 });
  }
}
