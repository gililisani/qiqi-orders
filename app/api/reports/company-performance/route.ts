import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdminWithPermission,
} from '../../../../platform/auth/guards';
import {
  computePeriodMetrics,
  computeSfBehaviorDistribution,
  fetchRevenueInputs,
  type PeriodStatus,
  type SalesEntry,
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
 * What counts = the `sales_entries` view (Hub orders once Done or paid in
 * full, plus NetSuite documents approved on the NetSuite review page).
 * Support funds: a Hub order's credit_earned vs the SF items the client
 * claimed (orders.support_fund_used is capped at earned, so the items are
 * the truth); an invoice billed externally carries its discount as both.
 * Balance = earned − used: positive → leftover, negative → top-up.
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
    const entriesByCompany = new Map<string, SalesEntry[]>();
    for (const e of inputs.entries) {
      const list = entriesByCompany.get(e.company_id) ?? [];
      list.push(e);
      entriesByCompany.set(e.company_id, list);
    }

    // ---- Per-period rows (pure — no queries) ----
    const rows: PeriodRow[] = periods.map((p: any) => {
      const company = Array.isArray(p.company) ? p.company[0] : p.company;
      const isEnrolled = company?.support_fund_id != null;
      const m = computePeriodMetrics(now, p, entriesByCompany.get(p.company_id) ?? []);

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
    const sfBehavior = computeSfBehaviorDistribution(enrolledPeriods, inputs.entries);

    return NextResponse.json({ rows, kpis, sfBehavior, filterOptions });
  } catch (err: any) {
    if (err instanceof Response) return err; // guard refusals keep their 401/403
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
