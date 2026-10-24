import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { apEvent, getApSettings } from '../../../../lib/ap/store';

/**
 * AP settings. GET (ap:view): settings + the admins who can be approvers.
 * PATCH (ap:edit): approvers, mailbox, a card's last 4 digits.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'ap:view');
    const db = createServiceRoleClient();
    const settings = await getApSettings(db);
    const { data: admins } = await db.from('admins').select('id, name, email').eq('enabled', true).order('name');
    return NextResponse.json({ settings, admins: admins ?? [] });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/settings] GET', err);
    return NextResponse.json({ error: err?.message || 'Failed to load AP settings.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'ap:edit');
    const body = await request.json();
    const db = createServiceRoleClient();
    const settings = await getApSettings(db);
    const patch: Record<string, unknown> = {};

    if (body.approver_ids !== undefined) {
      if (!Array.isArray(body.approver_ids)) return NextResponse.json({ error: 'approver_ids must be a list' }, { status: 400 });
      const ids = [...new Set(body.approver_ids.map(String))];
      // Approvers must be enabled admins.
      const { data: admins } = ids.length
        ? await db.from('admins').select('id').eq('enabled', true).in('id', ids)
        : { data: [] as Array<{ id: string }> };
      const valid = new Set((admins ?? []).map((a) => a.id));
      const invalid = ids.filter((id) => !valid.has(id));
      if (invalid.length) return NextResponse.json({ error: 'Approvers must be enabled admins.' }, { status: 400 });
      patch.approver_ids = ids;
    }

    if (body.mailbox !== undefined) {
      const mailbox = body.mailbox === null ? null : String(body.mailbox).trim().toLowerCase();
      if (mailbox && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) {
        return NextResponse.json({ error: 'Mailbox must be an email address.' }, { status: 400 });
      }
      patch.mailbox = mailbox || null;
    }

    if (body.card_last4 !== undefined) {
      // { ns_account_id, last4 } — a card whose account name doesn't carry its digits.
      const { ns_account_id, last4 } = body.card_last4 ?? {};
      if (last4 !== null && !/^\d{4}$/.test(String(last4 ?? ''))) {
        return NextResponse.json({ error: 'Last 4 digits must be 4 numbers.' }, { status: 400 });
      }
      const accounts = settings.payment_accounts.map((a) =>
        a.ns_account_id === String(ns_account_id) && a.type === 'card' ? { ...a, last4: last4 ?? null } : a,
      );
      patch.payment_accounts = accounts;
    }

    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });
    const { error } = await db
      .from('ap_settings')
      .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user.id })
      .eq('id', 1);
    if (error) throw new Error(error.message);
    await apEvent(db, null, 'settings_changed', { fields: Object.keys(patch) }, user.id);
    return NextResponse.json({ settings: await getApSettings(db) });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error('[ap/settings] PATCH', err);
    return NextResponse.json({ error: err?.message || 'Failed to save AP settings.' }, { status: 500 });
  }
}
