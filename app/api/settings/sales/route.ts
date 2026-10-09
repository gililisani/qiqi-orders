import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireAdminWithPermission } from '../../../../platform/auth/guards';
import { toSalesRule } from '../../../../lib/salesLedger/classify';

/**
 * Settings → Sales: what counts as sales in the sales ledger.
 *
 * GET (config:view) — the rule, alert emails + per-company sync status.
 * PUT (config:edit) — { historyStartDate, productSkuPrefixes[], discountItemNames[], alertEmails[] }.
 *     Documents re-classify on the next sync (nightly or "Sync now").
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be a list.`);
  const out = [...new Set(value.map((v) => String(v ?? '').trim()).filter(Boolean))];
  if (out.length > 50) throw new Error(`${field}: at most 50 entries.`);
  if (out.some((v) => v.length > 80)) throw new Error(`${field}: entries must be 80 characters or fewer.`);
  return out;
}

async function loadStatus(supabase: ReturnType<typeof createServiceRoleClient>) {
  const [settingsRes, companiesRes, syncRes] = await Promise.all([
    supabase.from('sales_settings').select('*').eq('id', 1).maybeSingle(),
    supabase.from('companies').select('id, company_name, netsuite_internal_id').order('company_name'),
    supabase.from('sales_company_sync').select('company_id, last_synced_at, last_error, document_count'),
  ]);
  for (const r of [settingsRes, companiesRes, syncRes]) if (r.error) throw new Error(r.error.message);
  const syncByCompany = new Map((syncRes.data ?? []).map((s: any) => [String(s.company_id), s]));
  return {
    rule: toSalesRule(settingsRes.data),
    alertEmails: ((settingsRes.data?.alert_emails ?? []) as string[]),
    updatedAt: settingsRes.data?.updated_at ?? null,
    netsuiteConfigured: !!process.env.NETSUITE_ACCOUNT_ID,
    companies: (companiesRes.data ?? []).map((c: any) => {
      const s: any = syncByCompany.get(String(c.id));
      return {
        id: String(c.id),
        name: String(c.company_name),
        linked: /^\d+$/.test(String(c.netsuite_internal_id ?? '').trim()),
        lastSyncedAt: s?.last_synced_at ?? null,
        lastError: s?.last_error ?? null,
        documentCount: Number(s?.document_count ?? 0),
      };
    }),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'config:view');
    return NextResponse.json(await loadStatus(createServiceRoleClient()));
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to load sales settings.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAdminWithPermission(request, 'config:edit');
    const body = await request.json().catch(() => ({}));
    let row;
    try {
      const start = body?.historyStartDate ? String(body.historyStartDate) : null;
      if (start !== null) {
        if (!ISO_DATE.test(start) || Number.isNaN(Date.parse(start))) throw new Error('History start date must be a date (YYYY-MM-DD).');
        if (start > new Date().toISOString().slice(0, 10)) throw new Error('History start date cannot be in the future.');
      }
      row = {
        id: 1,
        history_start_date: start,
        product_sku_prefixes: cleanList(body?.productSkuPrefixes ?? [], 'Product SKU prefixes').map((p) => p.toUpperCase()),
        discount_item_names: cleanList(body?.discountItemNames ?? [], 'Discount items'),
        alert_emails: (() => {
          const list = cleanList(body?.alertEmails ?? [], 'Alert emails').map((e) => e.toLowerCase());
          const bad = list.find((e) => !EMAIL.test(e));
          if (bad) throw new Error(`Not an email address: ${bad}`);
          if (list.length > 10) throw new Error('Alert emails: at most 10.');
          return list;
        })(),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      };
    } catch (validation: any) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from('sales_settings').upsert(row);
    if (error) throw new Error(error.message);
    return NextResponse.json(await loadStatus(supabase));
  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: err?.message || 'Failed to save sales settings.' }, { status: 500 });
  }
}
