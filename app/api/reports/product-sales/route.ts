import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * API endpoint for Product Sales Report
 * GET /api/reports/product-sales
 * Query params: startDate, endDate, companyIds (comma-separated), categoryIds (comma-separated)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const companyIdsParam = searchParams.get('companyIds');
    const categoryIdsParam = searchParams.get('categoryIds');

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
        company_id,
        created_at,
        status,
        order_items(
          quantity,
          unit_price,
          total_price,
          product:Products(
            id,
            sku,
            item_name,
            category:categories(id, name)
          )
        )
      `)
      .order('created_at', { ascending: false });

    // Apply date filters
    if (startDate) {
      ordersQuery = ordersQuery.gte('created_at', `${startDate}T00:00:00`);
    }

    if (endDate) {
      ordersQuery = ordersQuery.lte('created_at', `${endDate}T23:59:59`);
    }

    // Apply company filter
    if (companyIdsParam) {
      const companyIds = companyIdsParam.split(',').filter(Boolean);
      if (companyIds.length > 0) {
        ordersQuery = ordersQuery.in('company_id', companyIds);
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

    // Aggregate by product
    const productStats = new Map<
      string,
      {
        product_id: string;
        sku: string;
        product_name: string;
        category_id: string | null;
        category_name: string | null;
        quantity_sold: number;
        total_revenue: number;
        order_count: number;
        unit_prices: number[];
      }
    >();

    // Process orders
    (orders || []).forEach((order) => {
      if (!order.order_items || !Array.isArray(order.order_items)) return;

      order.order_items.forEach((item: any) => {
        const product = item.product;
        if (!product || !product.sku) return;

        const productId = product.id || product.sku;
        const existing = productStats.get(productId) || {
          product_id: productId,
          sku: product.sku,
          product_name: product.item_name || product.sku,
          category_id: null,
          category_name: null,
          quantity_sold: 0,
          total_revenue: 0,
          order_count: 0,
          unit_prices: [] as number[],
        };

        // Update category if available
        if (product.category) {
          const category = Array.isArray(product.category)
            ? product.category[0]
            : product.category;
          if (category) {
            existing.category_id = category.id;
            existing.category_name = category.name;
          }
        }

        existing.quantity_sold += item.quantity || 0;
        existing.total_revenue += item.total_price || 0;
        existing.order_count += 1;
        if (item.unit_price) {
          existing.unit_prices.push(item.unit_price);
        }

        productStats.set(productId, existing);
      });
    });

    // Apply category filter if specified
    let filteredProducts = Array.from(productStats.values());

    if (categoryIdsParam) {
      const categoryIds = categoryIdsParam.split(',').filter(Boolean);
      if (categoryIds.length > 0) {
        filteredProducts = filteredProducts.filter(
          (p) => p.category_id && categoryIds.includes(p.category_id)
        );
      }
    }

    // Calculate average price and format results
    const results = filteredProducts.map((stats) => {
      const averagePrice =
        stats.unit_prices.length > 0
          ? stats.unit_prices.reduce((sum, price) => sum + price, 0) /
            stats.unit_prices.length
          : stats.total_revenue / (stats.quantity_sold || 1);

      return {
        product_id: stats.product_id,
        sku: stats.sku,
        product_name: stats.product_name,
        category_name: stats.category_name || 'Uncategorized',
        quantity_sold: stats.quantity_sold,
        total_revenue: stats.total_revenue,
        order_count: stats.order_count,
        average_price: averagePrice,
      };
    });

    // Sort by total revenue descending
    results.sort((a, b) => b.total_revenue - a.total_revenue);

    return NextResponse.json({ data: results });
  } catch (error: any) {
    console.error('Error in product-sales report:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

