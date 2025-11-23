import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { recalculateCompanyTargetPeriods } from '../../../../lib/targetPeriods';

/**
 * API endpoint to recalculate target periods for a company
 * Called when order status changes to/from Done
 */
export async function POST(request: NextRequest) {
  try {
    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Recalculate target periods
    await recalculateCompanyTargetPeriods(supabase, companyId);

    return NextResponse.json({
      success: true,
      message: 'Target periods recalculated successfully',
    });
  } catch (error: any) {
    console.error('Error recalculating target periods:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to recalculate target periods' },
      { status: 500 }
    );
  }
}

