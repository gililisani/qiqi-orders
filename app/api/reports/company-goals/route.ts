import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { calculateTargetPeriodProgress } from '../../../../lib/targetPeriods';

/**
 * API endpoint for Company Annual Goals Progress Report
 * GET /api/reports/company-goals
 * Query params: companyIds (comma-separated), targetPeriodId, startDate, endDate
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyIdsParam = searchParams.get('companyIds');
    const targetPeriodId = searchParams.get('targetPeriodId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Initialize Supabase client with service role
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Build query for target periods
    let targetPeriodsQuery = supabase
      .from('target_periods')
      .select(`
        *,
        company:companies(
          id,
          company_name,
          netsuite_number
        )
      `)
      .order('start_date', { ascending: true });

    // Apply filters
    if (companyIdsParam) {
      const companyIds = companyIdsParam.split(',').filter(Boolean);
      if (companyIds.length > 0) {
        targetPeriodsQuery = targetPeriodsQuery.in('company_id', companyIds);
      }
    }

    if (targetPeriodId) {
      targetPeriodsQuery = targetPeriodsQuery.eq('id', targetPeriodId);
    }

    if (startDate) {
      targetPeriodsQuery = targetPeriodsQuery.gte('end_date', startDate);
    }

    if (endDate) {
      targetPeriodsQuery = targetPeriodsQuery.lte('start_date', endDate);
    }

    const { data: targetPeriods, error: periodsError } = await targetPeriodsQuery;

    if (periodsError) {
      console.error('Error fetching target periods:', periodsError);
      return NextResponse.json(
        { error: 'Failed to fetch target periods' },
        { status: 500 }
      );
    }

    if (!targetPeriods || targetPeriods.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Calculate progress for each target period
    const results = await Promise.all(
      targetPeriods.map(async (period) => {
        const companyId = period.company_id;
        const progress = await calculateTargetPeriodProgress(
          supabase,
          companyId,
          period.start_date,
          period.end_date
        );

        // Check if period is ended
        const periodEndDate = new Date(period.end_date);
        periodEndDate.setHours(23, 59, 59, 999);
        const now = new Date();
        const isEnded = now > periodEndDate;

        const startDateObj = new Date(period.start_date);
        const daysRemaining = isEnded
          ? 0
          : Math.ceil((periodEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const hasStarted = now >= startDateObj;

        const progressPercentage =
          period.target_amount > 0
            ? Math.round((progress / period.target_amount) * 100)
            : 0;

        return {
          id: period.id,
          company_id: companyId,
          company_name: Array.isArray(period.company)
            ? period.company[0]?.company_name
            : period.company?.company_name,
          netsuite_number: Array.isArray(period.company)
            ? period.company[0]?.netsuite_number
            : period.company?.netsuite_number,
          period_name: period.period_name,
          start_date: period.start_date,
          end_date: period.end_date,
          target_amount: period.target_amount,
          current_progress: progress,
          progress_percentage: progressPercentage,
          is_ended: isEnded,
          days_remaining: daysRemaining,
          has_started: hasStarted,
        };
      })
    );

    return NextResponse.json({ data: results });
  } catch (error: any) {
    console.error('Error in company-goals report:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

