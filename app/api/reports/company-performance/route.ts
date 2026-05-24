import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';
import { calculateTargetPeriodProgress } from '../../../../lib/targetPeriods';

/**
 * GET /api/reports/company-performance
 *   ?scope=active|all
 *   &companyId=<uuid>        (optional)
 *   &subsidiaryId=<uuid>     (optional)
 *
 * One row per target_period. Actuals use calculateTargetPeriodProgress
 * so this report stays in sync with /admin/reports/company-goals.
 *
 * Support-fund semantics (important — see useOrderFormController.ts):
 *   `orders.support_fund_used` is CAPPED at `orders.credit_earned`, so
 *   it can never directly reveal a top-up. What the client actually
 *   claimed lives in the SF line items — `order_items.total_price`
 *   where `is_support_fund_item = true`. That sum is the canonical
 *   "credit used" from the user's perspective, and balance is:
 *       balance = credit_earned − credit_claimed
 *   Positive → leftover (under-redeemed). Negative → top-up
 *   (client claimed more SF products than they earned and paid the
 *   difference). Zero → exact match.
 *
 * Companies whose `companies.support_fund_id` is NULL are flagged
 * `isEnrolled = false` and excluded from SF KPIs / SF behavior — they
 * aren't on any support-fund tier so "did they redeem?" doesn't apply.
 */

type Scope = 'active' | 'all';

type Status =
  | 'Not Started'
  | 'Ahead'
  | 'On Track'
  | 'Slipping'
  | 'Complete'
  | 'At Risk';

interface PeriodRow {
  periodId: string;
  companyId: string;
  companyName: string;
  netsuiteNumber: string | null;
  subsidiaryId: string | null;
  isEnrolled: boolean;
  periodName: string;
  startDate: string;
  endDate: string;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  target: number;
  actual: number;
  progressPct: number;
  expectedPct: number;
  paceDeltaPct: number;
  status: Status;
  sfEarned: number;
  sfUsed: number;       // = sum of SF line items (what client claimed)
  sfBalance: number;    // = sfEarned − sfUsed
}

function classifyStatus(
  now: Date,
  startDate: Date,
  endDate: Date,
  target: number,
  actual: number,
  progressPct: number,
  expectedPct: number,
): Status {
  if (now < startDate) return 'Not Started';
  if (now > endDate) return actual >= target ? 'Complete' : 'At Risk';
  if (progressPct >= expectedPct + 5) return 'Ahead';
  if (progressPct < expectedPct - 20) return 'Slipping';
  return 'On Track';
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const scope = (searchParams.get('scope') ?? 'active') as Scope;
    const companyIdFilter = searchParams.get('companyId') || null;
    const subsidiaryIdFilter = searchParams.get('subsidiaryId') || null;

    const supabase = createServiceRoleClient();
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);

    // ---- Filter options (always: ALL companies / subsidiaries with periods
    //      in the current scope, regardless of company/subsidiary filter). ----
    let allPeriodsQuery = supabase
      .from('target_periods')
      .select(
        'company:companies(id, company_name, subsidiary_id, support_fund_id, subsidiary:subsidiaries(id, name))',
      );
    if (scope === 'active') {
      allPeriodsQuery = allPeriodsQuery
        .lte('start_date', todayISO)
        .gte('end_date', todayISO);
    }
    const { data: allPeriodsRaw, error: allPeriodsErr } = await allPeriodsQuery;
    if (allPeriodsErr) throw allPeriodsErr;

    const companyOptionsMap = new Map<
      string,
      { id: string; name: string; subsidiaryId: string | null; isEnrolled: boolean }
    >();
    const subsidiaryOptionsMap = new Map<string, { id: string; name: string }>();
    for (const row of allPeriodsRaw ?? []) {
      const c: any = Array.isArray((row as any).company)
        ? (row as any).company[0]
        : (row as any).company;
      if (!c) continue;
      if (!companyOptionsMap.has(c.id)) {
        companyOptionsMap.set(c.id, {
          id: c.id,
          name: c.company_name ?? 'Unknown',
          subsidiaryId: c.subsidiary_id ?? null,
          isEnrolled: c.support_fund_id != null,
        });
      }
      const sub: any = Array.isArray(c.subsidiary) ? c.subsidiary[0] : c.subsidiary;
      if (sub && !subsidiaryOptionsMap.has(sub.id)) {
        subsidiaryOptionsMap.set(sub.id, { id: sub.id, name: sub.name });
      }
    }

    const filterOptions = {
      companies: Array.from(companyOptionsMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      subsidiaries: Array.from(subsidiaryOptionsMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };

    // ---- The actual filtered periods query ----
    let periodsQuery = supabase
      .from('target_periods')
      .select(
        'id, company_id, period_name, start_date, end_date, target_amount, company:companies(id, company_name, netsuite_number, subsidiary_id, support_fund_id)',
      )
      .order('end_date', { ascending: true });

    if (scope === 'active') {
      periodsQuery = periodsQuery
        .lte('start_date', todayISO)
        .gte('end_date', todayISO);
    }
    if (companyIdFilter) {
      periodsQuery = periodsQuery.eq('company_id', companyIdFilter);
    }

    const { data: periodsRaw, error: periodsErr } = await periodsQuery;
    if (periodsErr) throw periodsErr;

    // Subsidiary filter is applied in JS (we joined companies, easier than a
    // server-side composite filter through PostgREST).
    const periods = (periodsRaw ?? []).filter((p: any) => {
      if (!subsidiaryIdFilter) return true;
      const c = Array.isArray(p.company) ? p.company[0] : p.company;
      return c?.subsidiary_id === subsidiaryIdFilter;
    });

    if (periods.length === 0) {
      return NextResponse.json({
        rows: [],
        kpis: emptyKpis(),
        sfBehavior: emptySfBehavior(),
        filterOptions,
      });
    }

    // ---- Per-period rows ----
    const rows: PeriodRow[] = await Promise.all(
      periods.map(async (p: any) => {
        const target = Number(p.target_amount) || 0;
        const company = Array.isArray(p.company) ? p.company[0] : p.company;
        const isEnrolled = company?.support_fund_id != null;

        const actual = await calculateTargetPeriodProgress(
          supabase,
          p.company_id,
          p.start_date,
          p.end_date,
        );

        // Find Done orders for this company, filtered to those whose Done-date
        // falls in the period. For each: credit_earned (already on order) and
        // sum of order_items.total_price WHERE is_support_fund_item = true
        // (what the client actually claimed under their support fund).
        let sfEarned = 0;
        let sfUsed = 0;

        if (isEnrolled) {
          const { data: doneOrders, error: doneErr } = await supabase
            .from('orders')
            .select('id, credit_earned')
            .eq('company_id', p.company_id)
            .eq('status', 'Done');
          if (doneErr) throw doneErr;

          if (doneOrders && doneOrders.length > 0) {
            const allOrderIds = doneOrders.map((o: any) => o.id);
            const { data: history, error: historyErr } = await supabase
              .from('order_history')
              .select('order_id, created_at')
              .in('order_id', allOrderIds)
              .eq('status_to', 'Done')
              .order('created_at', { ascending: true });
            if (historyErr) throw historyErr;

            const periodStart = new Date(p.start_date);
            const periodEnd = new Date(p.end_date);
            periodEnd.setHours(23, 59, 59, 999);

            const firstDone = new Map<string, Date>();
            for (const h of history ?? []) {
              if (!firstDone.has(h.order_id)) {
                firstDone.set(h.order_id, new Date(h.created_at));
              }
            }

            const inPeriodOrderIds: string[] = [];
            const earnedByOrder = new Map<string, number>();
            for (const o of doneOrders as any[]) {
              const doneAt = firstDone.get(o.id);
              if (doneAt && doneAt >= periodStart && doneAt <= periodEnd) {
                inPeriodOrderIds.push(o.id);
                const earned = Number(o.credit_earned) || 0;
                earnedByOrder.set(o.id, earned);
                sfEarned += earned;
              }
            }

            if (inPeriodOrderIds.length > 0) {
              const { data: sfItems, error: sfItemsErr } = await supabase
                .from('order_items')
                .select('order_id, total_price')
                .in('order_id', inPeriodOrderIds)
                .eq('is_support_fund_item', true);
              if (sfItemsErr) throw sfItemsErr;
              for (const it of sfItems ?? []) {
                sfUsed += Number(it.total_price) || 0;
              }
            }
          }
        }

        const startDate = new Date(p.start_date);
        const endDate = new Date(p.end_date);
        endDate.setHours(23, 59, 59, 999);

        const daysTotal = Math.max(
          1,
          Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000),
        );
        const daysElapsedRaw = Math.ceil(
          (Math.min(now.getTime(), endDate.getTime()) - startDate.getTime()) /
            86400000,
        );
        const daysElapsed = Math.max(0, Math.min(daysTotal, daysElapsedRaw));
        const daysRemaining = Math.max(0, daysTotal - daysElapsed);

        const progressPct = target > 0 ? (actual / target) * 100 : 0;
        const expectedPct = (daysElapsed / daysTotal) * 100;
        const paceDeltaPct = progressPct - expectedPct;

        const status = classifyStatus(
          now,
          startDate,
          endDate,
          target,
          actual,
          progressPct,
          expectedPct,
        );

        return {
          periodId: p.id,
          companyId: p.company_id,
          companyName: company?.company_name ?? 'Unknown',
          netsuiteNumber: company?.netsuite_number ?? null,
          subsidiaryId: company?.subsidiary_id ?? null,
          isEnrolled,
          periodName: p.period_name ?? '',
          startDate: p.start_date,
          endDate: p.end_date,
          daysTotal,
          daysElapsed,
          daysRemaining,
          target,
          actual,
          progressPct,
          expectedPct,
          paceDeltaPct,
          status,
          sfEarned,
          sfUsed,
          sfBalance: sfEarned - sfUsed,
        };
      }),
    );

    const kpis = aggregateKpis(rows);
    const sfBehavior = await computeSfBehavior(supabase, periods, companyOptionsMap);

    return NextResponse.json({ rows, kpis, sfBehavior, filterOptions });
  } catch (err: any) {
    const msg = err?.message ?? 'Unknown error';
    const status =
      msg === 'Not authenticated' || msg === 'Forbidden' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

function emptyKpis() {
  return {
    onTrack: 0,
    slipping: 0,
    ahead: 0,
    atRisk: 0,
    complete: 0,
    notStarted: 0,
    totalTarget: 0,
    totalActual: 0,
    overallProgressPct: 0,
    enrolledCount: 0,
    notEnrolledCount: 0,
    sfEarned: 0,
    sfUsed: 0,
    sfRedemptionPct: 0,
    toppingUpCount: 0,
    avgTopUp: 0,
    leftoverTotal: 0,
    topUpTotal: 0,
  };
}

function emptySfBehavior() {
  return {
    underRedeemedPct: 0,
    fullyRedeemedPct: 0,
    toppedUpPct: 0,
    avgTopUp: 0,
    avgLeftover: 0,
    sampleSize: 0,
  };
}

function aggregateKpis(rows: PeriodRow[]) {
  let onTrack = 0,
    slipping = 0,
    ahead = 0,
    atRisk = 0,
    complete = 0,
    notStarted = 0;
  let totalTarget = 0,
    totalActual = 0;
  let sfEarned = 0,
    sfUsed = 0;
  let toppingUpCount = 0;
  let topUpTotal = 0;
  let leftoverTotal = 0;
  let enrolledCount = 0;
  let notEnrolledCount = 0;

  for (const r of rows) {
    totalTarget += r.target;
    totalActual += r.actual;
    if (r.isEnrolled) {
      enrolledCount += 1;
      sfEarned += r.sfEarned;
      sfUsed += r.sfUsed;
      if (r.sfBalance < 0) {
        toppingUpCount += 1;
        topUpTotal += -r.sfBalance;
      } else if (r.sfBalance > 0) {
        leftoverTotal += r.sfBalance;
      }
    } else {
      notEnrolledCount += 1;
    }
    switch (r.status) {
      case 'On Track':
        onTrack += 1;
        break;
      case 'Slipping':
        slipping += 1;
        break;
      case 'Ahead':
        ahead += 1;
        break;
      case 'At Risk':
        atRisk += 1;
        break;
      case 'Complete':
        complete += 1;
        break;
      case 'Not Started':
        notStarted += 1;
        break;
    }
  }

  return {
    onTrack,
    slipping,
    ahead,
    atRisk,
    complete,
    notStarted,
    totalTarget,
    totalActual,
    overallProgressPct: totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0,
    enrolledCount,
    notEnrolledCount,
    sfEarned,
    sfUsed,
    sfRedemptionPct: sfEarned > 0 ? (sfUsed / sfEarned) * 100 : 0,
    toppingUpCount,
    avgTopUp: toppingUpCount > 0 ? topUpTotal / toppingUpCount : 0,
    leftoverTotal,
    topUpTotal,
  };
}

async function computeSfBehavior(
  supabase: any,
  periods: any[],
  companyOptions: Map<string, { isEnrolled: boolean }>,
) {
  // Only enrolled companies count toward behavior distribution.
  const enrolledPeriods = periods.filter(
    (p: any) => companyOptions.get(p.company_id)?.isEnrolled,
  );
  const companyIds = Array.from(new Set(enrolledPeriods.map((p) => p.company_id)));
  if (companyIds.length === 0) return emptySfBehavior();

  const { data: doneOrders, error } = await supabase
    .from('orders')
    .select('id, company_id, credit_earned')
    .eq('status', 'Done')
    .in('company_id', companyIds);
  if (error) throw error;
  if (!doneOrders || doneOrders.length === 0) return emptySfBehavior();

  const orderIds = doneOrders.map((o: any) => o.id);
  const [historyRes, sfItemsRes] = await Promise.all([
    supabase
      .from('order_history')
      .select('order_id, created_at')
      .in('order_id', orderIds)
      .eq('status_to', 'Done')
      .order('created_at', { ascending: true }),
    supabase
      .from('order_items')
      .select('order_id, total_price')
      .in('order_id', orderIds)
      .eq('is_support_fund_item', true),
  ]);
  if (historyRes.error) throw historyRes.error;
  if (sfItemsRes.error) throw sfItemsRes.error;

  const firstDone = new Map<string, Date>();
  for (const h of historyRes.data ?? []) {
    if (!firstDone.has(h.order_id)) {
      firstDone.set(h.order_id, new Date(h.created_at));
    }
  }

  const claimedByOrder = new Map<string, number>();
  for (const it of sfItemsRes.data ?? []) {
    claimedByOrder.set(
      it.order_id,
      (claimedByOrder.get(it.order_id) ?? 0) + (Number(it.total_price) || 0),
    );
  }

  const periodsByCompany = new Map<string, Array<{ s: Date; e: Date }>>();
  for (const p of enrolledPeriods) {
    const s = new Date(p.start_date);
    const e = new Date(p.end_date);
    e.setHours(23, 59, 59, 999);
    const list = periodsByCompany.get(p.company_id) ?? [];
    list.push({ s, e });
    periodsByCompany.set(p.company_id, list);
  }

  let under = 0,
    full = 0,
    over = 0;
  let topUpSum = 0,
    leftoverSum = 0;
  let total = 0;

  for (const o of doneOrders as any[]) {
    const doneAt = firstDone.get(o.id);
    if (!doneAt) continue;
    const ranges = periodsByCompany.get(o.company_id) ?? [];
    if (!ranges.some((r) => doneAt >= r.s && doneAt <= r.e)) continue;

    const earned = Number(o.credit_earned) || 0;
    const claimed = claimedByOrder.get(o.id) ?? 0;
    if (earned === 0 && claimed === 0) continue;

    total += 1;
    const delta = earned - claimed;
    if (Math.abs(delta) < 0.01) {
      full += 1;
    } else if (delta > 0) {
      under += 1;
      leftoverSum += delta;
    } else {
      over += 1;
      topUpSum += -delta;
    }
  }

  return {
    underRedeemedPct: total > 0 ? (under / total) * 100 : 0,
    fullyRedeemedPct: total > 0 ? (full / total) * 100 : 0,
    toppedUpPct: total > 0 ? (over / total) * 100 : 0,
    avgTopUp: over > 0 ? topUpSum / over : 0,
    avgLeftover: under > 0 ? leftoverSum / under : 0,
    sampleSize: total,
  };
}
