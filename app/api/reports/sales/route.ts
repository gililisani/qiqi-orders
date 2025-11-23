import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API endpoint for Sales Report
 * GET /api/reports/sales
 * Query params: startDate, endDate, companyIds (comma-separated), statuses (comma-separated), subsidiaryIds (comma-separated), classIds (comma-separated)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyIdsParam = searchParams.get('companyIds');
    const statusesParam = searchParams.get('statuses');
    const subsidiaryIdsParam = searchParams.get('subsidiaryIds');
    const classIdsParam = searchParams.get('classIds');

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

    // Build query for orders
    let ordersQuery = supabase
      .from('orders')
      .select(`
        id,
        po_number,
        so_number,
        created_at,
        status,
        total_value,
        support_fund_used,
        credit_earned,
        company:companies(
          id,
          company_name,
          netsuite_number,
          subsidiary:subsidiaries(name),
          class:classes(name)
        ),
        order_items(count)
      `)
      .order('created_at', { ascending: false });

    // Apply filters
    if (startDate) {
      ordersQuery = ordersQuery.gte('created_at', `${startDate}T00:00:00`);
    }

    if (endDate) {
      ordersQuery = ordersQuery.lte('created_at', `${endDate}T23:59:59`);
    }

    if (companyIdsParam) {
      const companyIds = companyIdsParam.split(',').filter(Boolean);
      if (companyIds.length > 0) {
        ordersQuery = ordersQuery.in('company_id', companyIds);
      }
    }

    if (statusesParam) {
      const statuses = statusesParam.split(',').filter(Boolean);
      if (statuses.length > 0) {
        ordersQuery = ordersQuery.in('status', statuses);
      }
    }

    // Handle subsidiary and class filters by first fetching matching company IDs
    let companyIdFilters: string[] | null = null;

    if (subsidiaryIdsParam || classIdsParam) {
      let companiesQuery = supabase.from('companies').select('id');

      if (subsidiaryIdsParam) {
        const subsidiaryIds = subsidiaryIdsParam.split(',').filter(Boolean);
        if (subsidiaryIds.length > 0) {
          companiesQuery = companiesQuery.in('subsidiary_id', subsidiaryIds);
        }
      }

      if (classIdsParam) {
        const classIds = classIdsParam.split(',').filter(Boolean);
        if (classIds.length > 0) {
          companiesQuery = companiesQuery.in('class_id', classIds);
        }
      }

      const { data: matchingCompanies } = await companiesQuery;
      if (matchingCompanies && matchingCompanies.length > 0) {
        companyIdFilters = matchingCompanies.map((c) => c.id);
      } else {
        // No companies match the filters, return empty result
        return NextResponse.json({ data: [] });
      }
    }

    // Apply company ID filters if we have them
    if (companyIdFilters) {
      if (companyIdsParam) {
        // Combine with existing company filter (intersection)
        const existingCompanyIds = companyIdsParam.split(',').filter(Boolean);
        const intersection = companyIdFilters.filter((id) => existingCompanyIds.includes(id));
        if (intersection.length === 0) {
          return NextResponse.json({ data: [] });
        }
        ordersQuery = ordersQuery.in('company_id', intersection);
      } else {
        ordersQuery = ordersQuery.in('company_id', companyIdFilters);
      }
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ data: [] });
    }

    // Transform data for the report
    const results = orders.map((order) => {
      const company = Array.isArray(order.company) ? order.company[0] : order.company;
      const itemsCount = Array.isArray(order.order_items) 
        ? order.order_items.length 
        : (order.order_items as any)?.length || 0;

      return {
        id: order.id,
        order_number: order.po_number || order.so_number || order.id.substring(0, 8),
        date: order.created_at,
        company_name: company?.company_name || 'N/A',
        netsuite_number: company?.netsuite_number || 'N/A',
        status: order.status,
        total_value: order.total_value || 0,
        items_count: itemsCount,
        subsidiary: company?.subsidiary?.name || 'N/A',
        class: company?.class?.name || 'N/A',
        support_fund_used: order.support_fund_used || 0,
        credit_earned: order.credit_earned || 0,
      };
    });

    return NextResponse.json({ data: results });
  } catch (error: any) {
    console.error('Error in sales report:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

