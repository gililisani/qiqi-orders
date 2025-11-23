import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API endpoint for Company Performance Report
 * GET /api/reports/company-performance
 * Query params: startDate, endDate, companyIds (comma-separated), subsidiaryIds (comma-separated), classIds (comma-separated)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyIdsParam = searchParams.get('companyIds');
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

    // Build base query for companies
    let companiesQuery = supabase
      .from('companies')
      .select(`
        id,
        company_name,
        netsuite_number,
        subsidiary:subsidiaries(name),
        class:classes(name)
      `)
      .order('company_name');

    // Handle subsidiary and class filters
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

    if (companyIdsParam) {
      const companyIds = companyIdsParam.split(',').filter(Boolean);
      if (companyIds.length > 0) {
        companiesQuery = companiesQuery.in('id', companyIds);
      }
    }

    const { data: companies, error: companiesError } = await companiesQuery;

    if (companiesError) {
      console.error('Error fetching companies:', companiesError);
      return NextResponse.json(
        { error: 'Failed to fetch companies' },
        { status: 500 }
      );
    }

    if (!companies || companies.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const companyIds = companies.map((c) => c.id);

    // Build query for orders
    let ordersQuery = supabase
      .from('orders')
      .select(`
        id,
        company_id,
        created_at,
        total_value,
        status,
        support_fund_used,
        credit_earned,
        order_items(
          product:Products(sku, item_name)
        )
      `)
      .in('company_id', companyIds)
      .order('created_at', { ascending: false });

    // Apply date filters
    if (startDate) {
      ordersQuery = ordersQuery.gte('created_at', `${startDate}T00:00:00`);
    }

    if (endDate) {
      ordersQuery = ordersQuery.lte('created_at', `${endDate}T23:59:59`);
    }

    const { data: orders, error: ordersError } = await ordersQuery;

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
      return NextResponse.json(
        { error: 'Failed to fetch orders' },
        { status: 500 }
      );
    }

    // Aggregate data by company
    const companyStats = new Map<string, any>();

    // Initialize company stats
    companies.forEach((company) => {
      const subsidiary = Array.isArray(company.subsidiary)
        ? company.subsidiary[0]?.name
        : (company.subsidiary as any)?.name;
      const classData = Array.isArray(company.class)
        ? company.class[0]?.name
        : (company.class as any)?.name;
      
      companyStats.set(company.id, {
        company_id: company.id,
        company_name: company.company_name,
        netsuite_number: company.netsuite_number,
        subsidiary: subsidiary || 'N/A',
        class: classData || 'N/A',
        total_sales: 0,
        order_count: 0,
        support_fund_used: 0,
        credit_earned: 0,
        products: new Map<string, { sku: string; name: string; quantity: number; revenue: number }>(),
      });
    });

    // Process orders
    (orders || []).forEach((order) => {
      const stats = companyStats.get(order.company_id);
      if (!stats) return;

      stats.total_sales += order.total_value || 0;
      stats.order_count += 1;
      stats.support_fund_used += order.support_fund_used || 0;
      stats.credit_earned += order.credit_earned || 0;

      // Track products
      if (order.order_items && Array.isArray(order.order_items)) {
        order.order_items.forEach((item: any) => {
          const product = item.product;
          if (product && product.sku) {
            const existing = stats.products.get(product.sku) || {
              sku: product.sku,
              name: product.item_name || product.sku,
              quantity: 0,
              revenue: 0,
            };
            existing.quantity += item.quantity || 0;
            existing.revenue += item.total_price || 0;
            stats.products.set(product.sku, existing);
          }
        });
      }
    });

    // Convert to array and calculate averages
    const results = Array.from(companyStats.values()).map((stats) => {
      const averageOrderValue =
        stats.order_count > 0 ? stats.total_sales / stats.order_count : 0;

      // Get top 5 products by revenue
      type ProductStats = { sku: string; name: string; quantity: number; revenue: number };
      const topProducts = Array.from(stats.products.values() as Iterable<ProductStats>)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5)
        .map((p) => ({
          sku: p.sku,
          name: p.name,
          quantity: p.quantity,
          revenue: p.revenue,
        }));

      return {
        company_id: stats.company_id,
        company_name: stats.company_name,
        netsuite_number: stats.netsuite_number,
        subsidiary: stats.subsidiary || 'N/A',
        class: stats.class || 'N/A',
        total_sales: stats.total_sales,
        order_count: stats.order_count,
        average_order_value: averageOrderValue,
        support_fund_used: stats.support_fund_used,
        credit_earned: stats.credit_earned,
        top_products: topProducts,
      };
    });

    // Sort by total sales descending
    results.sort((a, b) => b.total_sales - a.total_sales);

    return NextResponse.json({ data: results });
  } catch (error: any) {
    console.error('Error in company-performance report:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

