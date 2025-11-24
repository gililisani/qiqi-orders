import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API endpoint for Performances Report
 * GET /api/reports/performances
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

    // Determine date range for queries
    let queryStartDate = startDate;
    let queryEndDate = endDate;
    
    // If no dates provided, use current year
    if (!queryStartDate || !queryEndDate) {
      const now = new Date();
      const currentYear = now.getFullYear();
      queryStartDate = `${currentYear}-01-01`;
      queryEndDate = `${currentYear}-12-31`;
    }

    // Build base query for orders
    let ordersQuery = supabase
      .from('orders')
      .select('id, company_id, created_at, total_value, status, credit_earned, support_fund_used')
      .order('created_at', { ascending: false });

    // Apply date filters
    if (queryStartDate) {
      ordersQuery = ordersQuery.gte('created_at', `${queryStartDate}T00:00:00`);
    }
    if (queryEndDate) {
      ordersQuery = ordersQuery.lte('created_at', `${queryEndDate}T23:59:59`);
    }

    // Apply company filter
    if (companyIdsParam) {
      const companyIds = companyIdsParam.split(',').filter(Boolean);
      if (companyIds.length > 0) {
        ordersQuery = ordersQuery.in('company_id', companyIds);
      }
    }

    // Apply subsidiary and class filters via companies
    let companyFilterIds: string[] | null = null;
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
      
      const { data: filteredCompanies } = await companiesQuery;
      if (filteredCompanies) {
        companyFilterIds = filteredCompanies.map(c => c.id);
        if (companyFilterIds.length > 0) {
          ordersQuery = ordersQuery.in('company_id', companyFilterIds);
        } else {
          // No companies match filters, return empty results
          return NextResponse.json({
            summary: {
              totalSales: 0,
              totalSalesOrders: 0,
              totalOpenOrders: 0,
              totalOpenOrdersValue: 0,
              totalClients: 0,
              totalCreditEarned: 0,
              totalCreditUsed: 0,
            },
            monthlySales: [],
            dailySales: [],
            topClients: [],
            topProducts: [],
          });
        }
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

    // Calculate summary stats
    const doneOrders = (orders || []).filter(o => o.status === 'Done');
    const openOrders = (orders || []).filter(o => o.status === 'In Process' || o.status === 'Ready');
    
    const totalSales = doneOrders.reduce((sum, o) => sum + (o.total_value || 0), 0);
    const totalOpenOrdersValue = openOrders.reduce((sum, o) => sum + (o.total_value || 0), 0);
    const totalCreditEarned = (orders || []).reduce((sum, o) => sum + (o.credit_earned || 0), 0);
    const totalCreditUsed = (orders || []).reduce((sum, o) => sum + (o.support_fund_used || 0), 0);

    // Get total clients count
    let totalClients = 0;
    if (companyFilterIds && companyFilterIds.length > 0) {
      const { data: clientsData } = await supabase
        .from('clients')
        .select('company_id')
        .in('company_id', companyFilterIds);
      const uniqueCompanyIds = new Set(clientsData?.map(c => c.company_id) || []);
      totalClients = uniqueCompanyIds.size;
    } else {
      const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true });
      totalClients = count || 0;
    }

    // Calculate monthly sales
    const monthlySalesMap = new Map<string, number>();
    doneOrders.forEach(order => {
      const date = new Date(order.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      monthlySalesMap.set(monthKey, (monthlySalesMap.get(monthKey) || 0) + (order.total_value || 0));
    });
    const monthlySales = Array.from(monthlySalesMap.entries())
      .map(([month, sales]) => ({ month, sales }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Calculate daily sales (grouped by month for display)
    const dailySalesMap = new Map<string, number>();
    doneOrders.forEach(order => {
      const date = new Date(order.created_at);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      dailySalesMap.set(monthKey, (dailySalesMap.get(monthKey) || 0) + (order.total_value || 0));
    });
    const dailySales = Array.from(dailySalesMap.entries())
      .map(([month, sales]) => ({ date: month, sales }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Get top clients (by sales)
    const clientSalesMap = new Map<string, { companyId: string; companyName: string; sales: number }>();
    doneOrders.forEach(order => {
      const existing = clientSalesMap.get(order.company_id) || { companyId: order.company_id, companyName: '', sales: 0 };
      existing.sales += order.total_value || 0;
      clientSalesMap.set(order.company_id, existing);
    });

    // Fetch company names
    const companyIds = Array.from(clientSalesMap.keys());
    if (companyIds.length > 0) {
      const { data: companiesData } = await supabase
        .from('companies')
        .select('id, company_name')
        .in('id', companyIds);
      
      companiesData?.forEach(company => {
        const clientData = clientSalesMap.get(company.id);
        if (clientData) {
          clientData.companyName = company.company_name;
        }
      });
    }

    const topClients = Array.from(clientSalesMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 5)
      .map(c => ({ companyName: c.companyName, sales: c.sales }));

    // Get top products
    const productSalesMap = new Map<string, { sku: string; name: string; sales: number }>();
    
    const orderIds = doneOrders.map(o => o.id);
    if (orderIds.length > 0) {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('order_id, total_price, product:Products(sku, item_name)')
        .in('order_id', orderIds);

      orderItems?.forEach((item: any) => {
        const product = item.product;
        if (product && product.sku) {
          const existing = productSalesMap.get(product.sku) || { sku: product.sku, name: product.item_name || product.sku, sales: 0 };
          existing.sales += item.total_price || 0;
          productSalesMap.set(product.sku, existing);
        }
      });
    }

    const topProducts = Array.from(productSalesMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
      .map(p => ({ sku: p.sku, name: p.name, sales: p.sales }));

    return NextResponse.json({
      summary: {
        totalSales,
        totalSalesOrders: doneOrders.length,
        totalOpenOrders: openOrders.length,
        totalOpenOrdersValue,
        totalClients: totalClients || 0,
        totalCreditEarned,
        totalCreditUsed,
      },
      monthlySales,
      dailySales,
      topClients,
      topProducts,
    });
  } catch (error: any) {
    console.error('Error in performances report:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

