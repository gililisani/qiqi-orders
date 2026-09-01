import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient, requireWithPermission } from '../../../../platform/auth/guards';
import { computeOrderMoney, type SaveItemInput } from '../../../../lib/orderSave';
import { SHIPMENT_TYPE_CODES } from '../../../../lib/shipmentTypes';

/**
 * POST /api/orders/save — THE order write path (create + update).
 *
 * The last money-path hardening step (audit P3 follow-through): the browser
 * sends only product ids and quantities; every money field (unit_price,
 * total_price, total_value, credit_earned, support_fund_used) is computed
 * HERE from the catalog, and the write is one transaction via the
 * order_save_* SQL functions (migration 20260803220000). The client write
 * policies on orders/order_items are dropped in 20260803230000 — this route
 * is the only way orders are created or edited from the forms.
 *
 * Body: {
 *   mode: 'create' | 'update',
 *   orderId?: string,               // update only
 *   companyId: string,
 *   poNumber?: string | null,       // generated server-side when empty
 *   asDraft: boolean,
 *   items: Array<{ product_id, quantity, case_qty?, is_support_fund_item }>,
 *     // in DISPLAY order — sort_order is assigned by position
 * }
 *
 * Rules (single-sourced with the UI's status gating):
 *   create → status Draft|Open. update → current status must be Draft|Open;
 *   Draft saves stay/become Draft, non-draft saves promote Draft→Open and
 *   otherwise keep the current status. Clients only for their own company;
 *   admins for any.
 */

const EDITABLE_STATUSES = ['Draft', 'Open'];

function generatePoNumber(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let po = '';
  for (let i = 0; i < 6; i++) po += chars.charAt(Math.floor(Math.random() * chars.length));
  return po;
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireWithPermission(request, 'orders', 'orders:edit');
    const isAdmin = user.roles.includes('admin');

    const body = await request.json();
    const mode = body.mode === 'update' ? 'update' : 'create';
    const companyId = typeof body.companyId === 'string' ? body.companyId : null;
    const asDraft = !!body.asDraft;
    const rawItems: SaveItemInput[] = Array.isArray(body.items) ? body.items : [];

    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required.' }, { status: 400 });
    }
    if (rawItems.length === 0) {
      return NextResponse.json({ error: 'The order needs at least one item.' }, { status: 400 });
    }
    const shipmentType =
      typeof body.shipmentType === 'string' ? body.shipmentType : null;
    if (!shipmentType || !SHIPMENT_TYPE_CODES.includes(shipmentType)) {
      return NextResponse.json(
        { error: 'Please select a shipment type.' },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();

    // ---- Scope: clients act only for their own company ----
    if (!isAdmin) {
      const { data: client } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .maybeSingle();
      if (!client || client.company_id !== companyId) {
        return NextResponse.json({ error: 'Access denied.' }, { status: 403 });
      }
    }

    // ---- Company: class (pricing region), SF tier, fulfilling location ----
    const { data: company, error: companyErr } = await supabase
      .from('companies')
      .select('id, location_id, class:classes(name), support_fund:support_fund_levels(percent)')
      .eq('id', companyId)
      .maybeSingle();
    if (companyErr) throw new Error(`company lookup: ${companyErr.message}`);
    if (!company) {
      return NextResponse.json({ error: 'Company not found.' }, { status: 404 });
    }
    const companyRaw: any = company;
    const className: string | null =
      (Array.isArray(companyRaw.class) ? companyRaw.class[0] : companyRaw.class)?.name ?? null;
    const sfPercent: number | null =
      (Array.isArray(companyRaw.support_fund) ? companyRaw.support_fund[0] : companyRaw.support_fund)
        ?.percent ?? null;

    // ---- Catalog: the ONLY source of prices ----
    const productIds = [...new Set(rawItems.map((i) => Number(i.product_id)))];
    const { data: products, error: productsErr } = await supabase
      .from('Products')
      .select('id, sku, price_americas, price_international, qualifies_for_credit_earning, enable')
      .in('id', productIds);
    if (productsErr) throw new Error(`catalog lookup: ${productsErr.message}`);
    const productsById = new Map((products ?? []).map((p: any) => [Number(p.id), p]));

    let money;
    try {
      money = computeOrderMoney({
        items: rawItems,
        productsById,
        companyClassName: className,
        supportFundPercent: sfPercent,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    // ---- History writer identity ----
    const { data: profile } = await supabase
      .from(isAdmin ? 'admins' : 'clients')
      .select('name')
      .eq('id', user.id)
      .maybeSingle();
    const changedByName = profile?.name || (isAdmin ? 'Admin' : 'Client');
    const changedByRole = isAdmin ? 'admin' : 'client';

    if (mode === 'create') {
      const poNumber =
        typeof body.poNumber === 'string' && body.poNumber.trim()
          ? body.poNumber.trim()
          : generatePoNumber();
      const status = asDraft ? 'Draft' : 'Open';

      // location_id snapshot: freeze the company's CURRENT fulfilling
      // location on the order (cross-subsidiary fulfillment depends on it).
      const { data: newOrderId, error: rpcErr } = await supabase.rpc('order_save_create', {
        p_order: {
          company_id: companyId,
          user_id: user.id,
          po_number: poNumber,
          status,
          location_id: company.location_id ?? null,
          shipment_type: shipmentType,
          total_value: money.total_value,
          support_fund_used: money.support_fund_used,
          credit_earned: money.credit_earned,
        },
        p_items: money.items,
      });
      if (rpcErr) throw new Error(`order_save_create: ${rpcErr.message}`);

      const { error: historyErr } = await supabase.from('order_history').insert({
        order_id: newOrderId,
        action_type: 'order_created',
        status_to: status,
        notes: `Order created with ${money.items.length} items`,
        metadata: {
          po_number: poNumber,
          total_items: money.items.length,
          total_value: money.total_value,
          support_fund_used: money.support_fund_used,
          credit_earned: money.credit_earned,
        },
        changed_by_id: user.id,
        changed_by_name: changedByName,
        changed_by_role: changedByRole,
        visible_to_client: true,
      });
      if (historyErr) console.error('order_created history insert failed:', historyErr.message);

      return NextResponse.json({ success: true, orderId: newOrderId, status });
    }

    // ---- mode === 'update' ----
    const orderId = typeof body.orderId === 'string' ? body.orderId : null;
    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required for update.' }, { status: 400 });
    }

    const { data: existing, error: existingErr } = await supabase
      .from('orders')
      .select('id, company_id, status')
      .eq('id', orderId)
      .maybeSingle();
    if (existingErr) throw new Error(`order lookup: ${existingErr.message}`);
    if (!existing || existing.company_id !== companyId) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
    }
    if (!EDITABLE_STATUSES.includes(existing.status)) {
      return NextResponse.json(
        { error: `Orders in status "${existing.status}" cannot be edited.` },
        { status: 409 },
      );
    }

    const oldStatus = existing.status;
    const newStatus = asDraft ? 'Draft' : oldStatus === 'Draft' ? 'Open' : oldStatus;
    const poNumber =
      typeof body.poNumber === 'string' && body.poNumber.trim() ? body.poNumber.trim() : null;

    const { error: rpcErr } = await supabase.rpc('order_save_update', {
      p_order_id: orderId,
      p_order: {
        po_number: poNumber,
        status: newStatus,
        shipment_type: shipmentType,
        total_value: money.total_value,
        support_fund_used: money.support_fund_used,
        credit_earned: money.credit_earned,
      },
      p_items: money.items,
    });
    if (rpcErr) throw new Error(`order_save_update: ${rpcErr.message}`);

    const statusChanged = oldStatus !== newStatus;
    const { error: historyErr } = await supabase.from('order_history').insert({
      order_id: orderId,
      action_type: statusChanged ? 'status_change' : 'order_updated',
      status_from: statusChanged ? oldStatus : null,
      status_to: statusChanged ? newStatus : null,
      notes: statusChanged
        ? `Status changed from ${oldStatus} to ${newStatus}`
        : `Order updated with ${money.items.length} items`,
      metadata: {
        total_items: money.items.length,
        total_value: money.total_value,
        support_fund_used: money.support_fund_used,
        credit_earned: money.credit_earned,
      },
      changed_by_id: user.id,
      changed_by_name: changedByName,
      changed_by_role: changedByRole,
      visible_to_client: true,
    });
    if (historyErr) console.error('order_updated history insert failed:', historyErr.message);

    return NextResponse.json({
      success: true,
      orderId,
      status: newStatus,
      wasDraft: oldStatus === 'Draft',
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('Error in /api/orders/save:', error);
    return NextResponse.json({ error: error.message || 'Failed to save order.' }, { status: 500 });
  }
}
