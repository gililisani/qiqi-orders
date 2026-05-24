import { NextRequest, NextResponse } from 'next/server';
import {
  createServiceRoleClient,
  requireAdmin,
} from '../../../../platform/auth/guards';
import { calculateTargetPeriodProgress } from '../../../../lib/targetPeriods';

/**
 * GET /api/reports/company-performance?scope=active|all
 *
 * One row per target_period (a company × period combination). Actuals use
 * the canonical helper calculateTargetPeriodProgress — Done orders counted
 * on their Done-transition date plus historical_sales — so this report
 * always agrees with /admin/reports/company-goals.
 *
 * Adds support-fund context per period:
 *   - sf_allocated = SUM(orders.credit_earned) on the same Done-in-period set
 *   - sf_used      = SUM(orders.support_fund_used) on the same set
 *   - balance      = sf_allocated - sf_used (positive: leftover; negative: top-up)
 *
 * Aggregate KPIs and a small SF-behavior distribution are computed across
 * the returned rows so the page can render the overview cards without a
 * second round trip.
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
  sfAllocated: number;
  sfUsed: number;
  sfBalance: number;
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
  if (now > endDate) {
    return actual >= target ? 'Complete' : 'At Risk';
  }
  if (progressPct >= expectedPct + 5) return 'Ahead';
  if (progressPct < expectedPct - 20) return 'Slipping';
  return 'On Track';
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const { searchParams } = new URL(request.url);
    const scope = (searchParams.get('scope') ?? 'active') as Scope;

    const supabase = createServiceRoleClient();
    const now = new Date();
    const todayISO = now.toISOString().slice(0, 10);

    let periodsQuery = supabase
      .from('target_periods')
      .select(
        'id, company_id, period_name, start_date, end_date, target_amount, company:companies(id, company_name, netsuite_number)',
      )
      .order('end_date', { ascending: true });

    if (scope === 'active') {
      periodsQuery = periodsQuery
        .lte('start_date', todayISO)
        .gte('end_date', todayISO);
    }

    const { data: periods, error: periodsErr } = await periodsQuery;
    if (periodsErr) throw periodsErr;

    if (!periods || periods.length === 0) {
      return NextResponse.json({
        rows: [],
        kpis: emptyKpis(),
        sfBehavior: emptySfBehavior(),
      });
    }

    const rows: PeriodRow[] = await Promise.all(
      periods.map(async (p: any) => {
        const target = Number(p.target_amount) || 0;
        const company = Array.isArray(p.company) ? p.company[0] : p.company;

        const actual = await calculateTargetPeriodProgress(
          supabase,
          p.company_id,
          p.start_date,
          p.end_date,
        );

        // SF allocated / used = SUM over the same Done-in-period order set.
        const { data: doneOrders, error: doneErr } = await supabase
          .from('orders')
          .select('id, credit_earned, support_fund_used')
          .eq('company_id', p.company_id)
          .eq('status', 'Done');
        if (doneErr) throw doneErr;

        let sfAllocated = 0;
        let sfUsed = 0;
        if (doneOrders && doneOrders.length > 0) {
          const orderIds = doneOrders.map((o: any) => o.id);
          const { data: history, error: historyErr } = await supabase
            .from('order_history')
            .select('order_id, created_at')
            .in('order_id', orderIds)
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

          const byId = new Map<string, any>(doneOrders.map((o: any) => [o.id, o]));
          for (const [orderId, doneAt] of firstDone) {
            if (doneAt >= periodStart && doneAt <= periodEnd) {
              const o = byId.get(orderId);
              if (o) {
                sfAllocated += Number(o.credit_earned) || 0;
                sfUsed += Number(o.support_fund_used) || 0;
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
          sfAllocated,
          sfUsed,
          sfBalance: sfAllocated - sfUsed,
        };
      }),
    );

    const kpis = aggregateKpis(rows);
    const sfBehavior = await computeSfBehavior(supabase, periods);

    return NextResponse.json({ rows, kpis, sfBehavior });
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
    sfAllocated: 0,
    sfUsed: 0,
    sfRedemptionPct: 0,
    toppingUpCount: 0,
    avgTopUp: 0,
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
    totalActual = 0,
    sfAllocated = 0,
    sfUsed = 0;
  let toppingUpCount = 0;
  let topUpSum = 0;

  for (const r of rows) {
    totalTarget += r.target;
    totalActual += r.actual;
    sfAllocated += r.sfAllocated;
    sfUsed += r.sfUsed;
    if (r.sfBalance < 0) {
      toppingUpCount += 1;
      topUpSum += -r.sfBalance;
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
    sfAllocated,
    sfUsed,
    sfRedemptionPct: sfAllocated > 0 ? (sfUsed / sfAllocated) * 100 : 0,
    toppingUpCount,
    avgTopUp: toppingUpCount > 0 ? topUpSum / toppingUpCount : 0,
  };
}

async function computeSfBehavior(supabase: any, periods: any[]) {
  const companyIds = Array.from(new Set(periods.map((p) => p.company_id)));
  if (companyIds.length === 0) return emptySfBehavior();

  const { data: doneOrders, error } = await supabase
    .from('orders')
    .select('id, company_id, credit_earned, support_fund_used')
    .eq('status', 'Done')
    .in('company_id', companyIds);
  if (error) throw error;

  if (!doneOrders || doneOrders.length === 0) return emptySfBehavior();

  const { data: history, error: hErr } = await supabase
    .from('order_history')
    .select('order_id, created_at')
    .in(
      'order_id',
      doneOrders.map((o: any) => o.id),
    )
    .eq('status_to', 'Done')
    .order('created_at', { ascending: true });
  if (hErr) throw hErr;

  const firstDone = new Map<string, Date>();
  for (const h of history ?? []) {
    if (!firstDone.has(h.order_id)) {
      firstDone.set(h.order_id, new Date(h.created_at));
    }
  }

  const periodsByCompany = new Map<string, Array<{ s: Date; e: Date }>>();
  for (const p of periods) {
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
    const used = Number(o.support_fund_used) || 0;
    if (earned === 0 && used === 0) continue;

    total += 1;
    const delta = earned - used;
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
