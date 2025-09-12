import { NextRequest, NextResponse } from 'next/server';
import { createNetSuiteAPI, NetSuiteProduct } from '../../../../../lib/netsuite';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    // Initialize NetSuite API
    const netsuite = createNetSuiteAPI();
    
    // Test connection first
    const isConnected = await netsuite.testConnection();
    if (!isConnected) {
      return NextResponse.json(
        { error: 'Failed to connect to NetSuite. Please check your credentials.' },
        { status: 500 }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch products from NetSuite
    const netsuiteProducts = await netsuite.getProducts(1000, 0);
    
    if (!netsuiteProducts || netsuiteProducts.length === 0) {
      return NextResponse.json(
        { error: 'No products found in NetSuite' },
        { status: 404 }
      );
    }

    // Transform NetSuite products to our format
    const transformedProducts = netsuiteProducts.map((product: NetSuiteProduct) => ({
      item_name: product.displayname || product.itemid || 'Unknown Product',
      netsuite_name: product.displayname,
      sku: product.custitem_qiqi_sku || product.itemid || '',
      upc: product.upccode || '',
      size: product.custitem_qiqi_size || '',
      case_pack: product.custitem_qiqi_case_pack || 1,
      price_international: product.custitem_qiqi_international_price || product.baseprice || 0,
      price_americas: product.custitem_qiqi_americas_price || product.baseprice || 0,
      enable: !product.isinactive,
      list_in_support_funds: product.custitem_qiqi_support_funds || false,
      visible_to_americas: product.custitem_qiqi_visible_americas !== false,
      visible_to_international: product.custitem_qiqi_visible_international !== false,
      picture_url: null, // NetSuite doesn't typically store image URLs in the item record
      netsuite_id: product.id,
      netsuite_itemid: product.itemid,
    }));

    // Sync with Supabase
    const results = {
      created: 0,
      updated: 0,
      errors: 0,
      products: [] as any[],
    };

    for (const product of transformedProducts) {
      try {
        // Check if product already exists by NetSuite ID
        const { data: existingProduct } = await supabase
          .from('Products')
          .select('id')
          .eq('netsuite_id', product.netsuite_id)
          .single();

        if (existingProduct) {
          // Update existing product
          const { error: updateError } = await supabase
            .from('Products')
            .update({
              item_name: product.item_name,
              netsuite_name: product.netsuite_name,
              sku: product.sku,
              upc: product.upc,
              size: product.size,
              case_pack: product.case_pack,
              price_international: product.price_international,
              price_americas: product.price_americas,
              enable: product.enable,
              list_in_support_funds: product.list_in_support_funds,
              visible_to_americas: product.visible_to_americas,
              visible_to_international: product.visible_to_international,
              picture_url: product.picture_url,
              netsuite_itemid: product.netsuite_itemid,
            })
            .eq('netsuite_id', product.netsuite_id);

          if (updateError) {
            console.error('Error updating product:', updateError);
            results.errors++;
          } else {
            results.updated++;
            results.products.push({ ...product, id: existingProduct.id, action: 'updated' });
          }
        } else {
          // Create new product
          const { data: newProduct, error: insertError } = await supabase
            .from('Products')
            .insert([product])
            .select()
            .single();

          if (insertError) {
            console.error('Error creating product:', insertError);
            results.errors++;
          } else {
            results.created++;
            results.products.push({ ...newProduct, action: 'created' });
          }
        }
      } catch (error) {
        console.error('Error processing product:', error);
        results.errors++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sync completed. Created: ${results.created}, Updated: ${results.updated}, Errors: ${results.errors}`,
      results,
    });

  } catch (error: any) {
    console.error('NetSuite sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to sync products from NetSuite' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const netsuite = createNetSuiteAPI();
    const isConnected = await netsuite.testConnection();
    
    return NextResponse.json({
      connected: isConnected,
      message: isConnected ? 'NetSuite connection successful' : 'NetSuite connection failed'
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to test NetSuite connection' },
      { status: 500 }
    );
  }
}
