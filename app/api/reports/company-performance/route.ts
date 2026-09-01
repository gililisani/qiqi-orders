import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdminWithPermission,
} from '../../../../platform/auth/guards';
import {
  buildSfUsedByOrder,
  computePeriodMetrics,
  computeSfBehaviorDistribution,
  fetchRevenueInputs,
  type PeriodStatus,
  type RevenueInputs,
} from '../../../../lib/companyPerformance';

/**
 * GET /api/reports/company-performance
 *   ?scope=active|all
 *   &companyId=<uuid>        (optional)
 *   &subsidiaryId=<uuid>     (optional)
 *
 * One row per target_period. All the revenue/SF math lives in
 * lib/companyPerformance (batched: a fixed number of queries regardless
 * of period count, throws on any query error — never silent zeros). The
 * per-company drill-down and target-period recalculation use the same
 * builder, so every view agrees.
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

type Status = PeriodStatus;

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

export async function GET(request: NextRequest) {
  try {
    await requireAdminWithPermission(request, 'insights');
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
        'id, company_id, period_name, start_date, end_date, target_amount, company:companies(id, company_name, netsuite_number, subsidiary_id, support_fund_id, support_fund:support_fund_levels(percent))',
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

    // ---- Batched inputs: fixed query count regardless of period count ----
    const companyIds = Array.from(new Set(periods.map((p: any) => p.company_id)));
    const inputs = await fetchRevenueInputs(supabase, companyIds);
    const sfUsedByOrder = buildSfUsedByOrder(inputs.sfItems);

    const ordersByCompany = new Map<string, RevenueInputs['doneOrders']>();
    for (const o of inputs.doneOrders) {
      const list = ordersByCompany.get(o.company_id) ?? [];
      list.push(o);
      ordersByCompany.set(o.company_id, list);
    }
    const historicalByCompany = new Map<string, RevenueInputs['historical']>();
    for (const h of inputs.historical) {
      const list = historicalByCompany.get(h.company_id) ?? [];
      list.push(h);
      historicalByCompany.set(h.company_id, list);
    }

    // ---- Per-period rows (pure — no queries) ----
    const sfPercentByCompany = new Map<string, number>();
    const rows: PeriodRow[] = periods.map((p: any) => {
      const company = Array.isArray(p.company) ? p.company[0] : p.company;
      const isEnrolled = company?.support_fund_id != null;
      const sfl = Array.isArray(company?.support_fund)
        ? company?.support_fund[0]
        : company?.support_fund;
      const sfPercent = Number(sfl?.percent) || 0;
      if (isEnrolled) sfPercentByCompany.set(p.company_id, sfPercent);

      const m = computePeriodMetrics(
        now,
        p,
        ordersByCompany.get(p.company_id) ?? [],
        inputs.firstDone,
        sfUsedByOrder,
        historicalByCompany.get(p.company_id) ?? [],
        sfPercent,
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
        daysTotal: m.daysTotal,
        daysElapsed: m.daysElapsed,
        daysRemaining: m.daysRemaining,
        target: m.target,
        actual: m.actual,
        progressPct: m.progressPct,
        expectedPct: m.expectedPct,
        paceDeltaPct: m.paceDeltaPct,
        status: m.status,
        // SF only applies to enrolled companies — keep zeros otherwise.
        sfEarned: isEnrolled ? m.sfEarned : 0,
        sfUsed: isEnrolled ? m.sfUsed : 0,
        sfBalance: isEnrolled ? m.sfBalance : 0,
      };
    });

    const kpis = aggregateKpis(rows);
    const enrolledPeriods = periods.filter(
      (p: any) => companyOptionsMap.get(p.company_id)?.isEnrolled,
    );
    const sfBehavior = computeSfBehaviorDistribution(
      enrolledPeriods,
      inputs.doneOrders,
      inputs.firstDone,
      sfUsedByOrder,
      inputs.historical,
      sfPercentByCompany,
    );

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
      case 'Fail':
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
