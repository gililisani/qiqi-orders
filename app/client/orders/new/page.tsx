'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import ClientLayout from '../../../components/ClientLayout';
import Link from 'next/link';
import Image from 'next/image';

interface Category {
  id: number;
  name: string;
  sort_order: number;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  image_url?: string;
}

interface Product {
  id: number;
  item_name: string;
  sku: string;
  upc: string;
  size: string;
  case_pack: number;
  price_international: number;
  price_americas: number;
  picture_url?: string;
  list_in_support_funds: boolean;
  visible_to_americas: boolean;
  visible_to_international: boolean;
  qualifies_for_credit_earning: boolean;
  category_id?: number;
  category?: Category;
}

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund?: { percent: number }[];
  class?: { name: string };
}

interface OrderItem {
  product_id: number;
  product: Product;
  case_qty: number;
  total_units: number;
  unit_price: number;
  total_price: number;
}

export default function NewOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [supportFundItems, setSupportFundItems] = useState<OrderItem[]>([]);
  const [showSupportFundRedemption, setShowSupportFundRedemption] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [poNumber, setPoNumber] = useState('');

  // Generate 6-character alphanumeric PO number
  const generatePONumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const getClientType = () => {
    if (!company?.class?.name) return 'Americas';
    
    const className = company.class.name.toLowerCase();
    return className.includes('international') ? 'International' : 'Americas';
  };

  const getProductPrice = (product: Product) => {
    if (!company?.class?.name) return product.price_americas;
    
    const className = company.class.name.toLowerCase();
    if (className.includes('international')) {
      return product.price_international;
    }
    return product.price_americas;
  };

  useEffect(() => {
    fetchCompanyData();
    
    // Fallback timeout to prevent infinite loading
    const timeout = setTimeout(() => {
      console.log('Loading timeout reached, setting loading to false');
      setLoading(false);
    }, 10000); // 10 seconds timeout
    
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    console.log('Company useEffect triggered, company:', company);
    if (company) {
      console.log('Company found, calling fetchProducts');
      fetchProducts();
    } else {
      console.log('No company, setting loading to false');
      setLoading(false);
    }
  }, [company]);

  const fetchCompanyData = async () => {
    try {
      console.log('Fetching company data...');
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');
      
      console.log('User found:', user.id);

      // Get user's company info
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            class:classes(name)
          )
        `)
        .eq('id', user.id)
        .single();

      console.log('Company data result:', { clientData, clientError });
      console.log('Full clientData structure:', JSON.stringify(clientData, null, 2));

      if (clientError) {
        console.error('Company data error:', clientError);
        throw clientError;
      }
      
      console.log('clientData?.company:', clientData?.company);
      
      // Handle both array and single object cases
      const companyData = Array.isArray(clientData?.company) 
        ? clientData?.company?.[0] 
        : clientData?.company;
        
      console.log('companyData:', companyData);
      
      if (companyData) {
        // Transform class and support_fund shapes consistently
        const transformedCompany = {
          ...companyData,
          class: Array.isArray(companyData.class) ? companyData.class[0] : companyData.class,
          support_fund: Array.isArray(companyData.support_fund)
            ? companyData.support_fund
            : (companyData.support_fund ? [companyData.support_fund] : [])
        } as Company;
        console.log('Transformed company support_fund:', transformedCompany.support_fund);
        console.log('Setting company:', transformedCompany);
        setCompany(transformedCompany);
      } else {
        console.log('No company data found');
        setCompany(null);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('Error in fetchCompanyData:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      console.log('Fetching products...');
      
      // Get products visible to this client's class
      const clientClass = getClientType();
      const isInternational = clientClass.toLowerCase().includes('international');
      
      console.log('Client class:', clientClass, 'isInternational:', isInternational);
      
      let productsQuery = supabase
        .from('Products')
        .select('*')
        .eq('enable', true);
      
      // Check if visibility columns exist by trying a test query
      const { data: testData, error: testError } = await supabase
        .from('Products')
        .select('visible_to_americas, visible_to_international')
        .limit(1);
      
      if (testError && testError.code === 'PGRST116') {
        // Columns don't exist, use all products
        console.log('Visibility columns not found, showing all products');
      } else if (!testError) {
        // Columns exist, apply class filtering
        console.log('Visibility columns found, applying class filtering');
        if (isInternational) {
          productsQuery = productsQuery.eq('visible_to_international', true);
        } else {
          productsQuery = productsQuery.eq('visible_to_americas', true);
        }
      } else {
        console.log('Error checking visibility columns:', testError);
      }
      
      console.log('Executing products query...');
      const { data: productsData, error: productsError } = await productsQuery
        .select(`
          *,
          category:categories(*)
        `)
        .order('item_name', { ascending: true });

      console.log('Products query result:', { productsData, productsError });

      if (productsError) {
        console.error('Products query error:', productsError);
        throw productsError;
      }
      
      console.log('Setting products:', productsData?.length || 0, 'products');
      setProducts(productsData || []);
    } catch (err: any) {
      console.error('Error in fetchProducts:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Group products by categories for display
  const getProductsByCategory = () => {
    const categorized: { [key: string]: { category: Category | null, products: Product[] } } = {};
    
    // First, get all visible categories for this client
    const isInternational = company?.class?.name?.includes('International') || false;
    const visibleCategories = new Set<number>();
    
    // Group products by their categories
    products.forEach(product => {
      if (product.category) {
        // Check if category is visible to this client class
        const categoryVisible = isInternational 
          ? product.category.visible_to_international 
          : product.category.visible_to_americas;
        
        if (categoryVisible) {
          const categoryKey = `${product.category.sort_order}-${product.category.name}`;
          if (!categorized[categoryKey]) {
            categorized[categoryKey] = {
              category: product.category,
              products: []
            };
          }
          categorized[categoryKey].products.push(product);
          visibleCategories.add(product.category.id);
        }
      }
    });
    
    // Add products without categories or with invisible categories to "No Category"
    const orphanedProducts = products.filter(product => 
      !product.category || 
      !visibleCategories.has(product.category.id)
    );
    
    if (orphanedProducts.length > 0) {
      categorized['999-No Category'] = {
        category: null,
        products: orphanedProducts
      };
    }
    
    // Sort categories by sort_order (999 for "No Category" will be last)
    return Object.entries(categorized)
      .sort(([keyA], [keyB]) => {
        const orderA = parseInt(keyA.split('-')[0]);
        const orderB = parseInt(keyB.split('-')[0]);
        return orderA - orderB;
      })
      .map(([, data]) => data);
  };

  const handleCaseQtyChange = (productId: number, caseQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = caseQty * product.case_pack;
    const totalPrice = unitPrice * totalUnits;

    setOrderItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      
      if (caseQty === 0) {
        // Remove item if case qty is 0
        return prev.filter(item => item.product_id !== productId);
      }

      const newItem: OrderItem = {
        product_id: productId,
        product,
        case_qty: caseQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        // Update existing item
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        // Add new item
        return [...prev, newItem];
      }
    });
  };

  const getOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // FIXED: Only include products that qualify for credit earning
    const creditEarningItems = orderItems.filter(item => item.product.qualifies_for_credit_earning);
    const creditEarningSubtotal = creditEarningItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // Support fund percent can arrive as array or single
    const rawSf = company?.support_fund as any;
    const supportFundPercent = Array.isArray(rawSf)
      ? (rawSf[0]?.percent || 0)
      : (rawSf?.percent || 0);
    const supportFundEarned = creditEarningSubtotal * (supportFundPercent / 100);
    const total = subtotal;

    return {
      subtotal,
      supportFundPercent,
      supportFundEarned,
      total,
      itemCount: orderItems.length
    };
  };

  const handleSupportFundRedemption = () => {
    const totals = getOrderTotals();
    if (totals.supportFundEarned > 0) {
      setShowSupportFundRedemption(true);
    }
  };

  const handleSupportFundItemChange = (productId: number, caseQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = caseQty * product.case_pack;
    const totalPrice = unitPrice * totalUnits;

    setSupportFundItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      
      if (caseQty === 0) {
        return prev.filter(item => item.product_id !== productId);
      }

      const newItem: OrderItem = {
        product_id: productId,
        product,
        case_qty: caseQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        const updated = [...prev];
        updated[existingIndex] = newItem;
        return updated;
      } else {
        return [...prev, newItem];
      }
    });
  };

  const getSupportFundTotals = () => {
    const subtotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
    const originalOrderTotals = getOrderTotals();
    const supportFundEarned = originalOrderTotals.supportFundEarned;
    const remainingCredit = supportFundEarned - subtotal;
    const finalTotal = remainingCredit < 0 ? Math.abs(remainingCredit) : 0;
    
    return {
      subtotal,
      supportFundEarned,
      remainingCredit,
      finalTotal,
      itemCount: supportFundItems.length
    };
  };

  const handleSubmit = async () => {
    if (orderItems.length === 0) {
      setError('Please add at least one product to your order.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const totals = getOrderTotals();

      // Generate PO number if not provided
      const finalPONumber = poNumber || generatePONumber();

      // Create the order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          user_id: user.id,
          company_id: company?.id,
          status: 'Open',
          total_value: totals.total,
          support_fund_used: 0, // Will be calculated in support fund redemption step
          credit_earned: totals.supportFundEarned,
          po_number: finalPONumber
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItemsData = orderItems.map((item, index) => ({
        order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: false,
        sort_order: index
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Send order confirmation notification
      try {
        await fetch('/api/orders/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: orderData.id,
            type: 'order_created'
          }),
        });
      } catch (notificationError) {
        console.error('Failed to send order confirmation:', notificationError);
        // Don't fail the order creation for notification errors
      }

      // Order completed successfully - redirect to order details
      // Credit is forfeited if not used (user chose to complete without support funds)
      router.push(`/client/orders/${orderData.id}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitWithSupportFund = async () => {
    if (orderItems.length === 0 && supportFundItems.length === 0) {
      setError('Please add at least one product to your order.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const originalTotals = getOrderTotals();
      const supportTotals = getSupportFundTotals();
      
      const supportFundUsed = Math.min(supportTotals.subtotal, originalTotals.supportFundEarned);
      const remainingCredit = originalTotals.supportFundEarned - supportFundUsed;
      const additionalCost = Math.max(0, supportTotals.subtotal - originalTotals.supportFundEarned);
      const finalTotal = originalTotals.total + additionalCost;

      // Generate PO number if not provided
      const finalPONumber = poNumber || generatePONumber();

      // Create the order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert([{
          user_id: user.id,
          company_id: company?.id,
          status: 'Open',
          total_value: finalTotal,
          support_fund_used: supportFundUsed,
          credit_earned: originalTotals.supportFundEarned,
          po_number: finalPONumber
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items (both regular and support fund items)
      const regularItemsData = orderItems.map((item, index) => ({
        order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: false,
        sort_order: index
      }));

      const supportFundItemsData = supportFundItems.map((item, index) => ({
        order_id: orderData.id,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: true,
        sort_order: orderItems.length + index // Continue numbering after regular items
      }));
      
      const orderItemsData = [...regularItemsData, ...supportFundItemsData];

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData);

      if (itemsError) throw itemsError;

      // Send order confirmation notification
      try {
        await fetch('/api/orders/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            orderId: orderData.id,
            type: 'order_created'
          }),
        });
      } catch (notificationError) {
        console.error('Failed to send order confirmation:', notificationError);
        // Don't fail the order creation for notification errors
      }

      router.push(`/client/orders/${orderData.id}`);
    } catch (err: any) {
      console.error('Error creating order:', err);
      setError(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error && !company) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link
            href="/client"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Back to Dashboard
          </Link>
        </div>
      </ClientLayout>
    );
  }

  const totals = getOrderTotals();
  const supportFundTotals = getSupportFundTotals();

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {showSupportFundRedemption ? 'Redeem Support Funds' : 'New Order'}
          </h1>
          <Link
            href="/client/orders"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Orders
          </Link>
        </div>
        {/* Main grid: Left content + Right sticky summary */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left: company info + products */}
          <div className="xl:col-span-2 space-y-6">
            {/* Company Info */}
            {company && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold mb-4">Order Information</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Company</label>
                    <p className="text-lg">{company.company_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Client Type</label>
                    <p className="text-lg">{getClientType()}</p>
                  </div>
                  {totals.supportFundPercent > 0 && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Support Fund</label>
                      <p className="text-lg">{totals.supportFundPercent}%</p>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-500">PO/Cheque Number (Optional)</label>
                    <input
                      type="text"
                      value={poNumber}
                      onChange={(e) => setPoNumber(e.target.value)}
                      placeholder="Enter PO number"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Tab Navigation */}
            {totals.supportFundPercent > 0 && (
              <div className="bg-white rounded-lg shadow">
                <div className="border-b border-gray-200">
                  <nav className="-mb-px flex space-x-8 px-6" aria-label="Tabs">
                    <button
                      onClick={() => setShowSupportFundRedemption(false)}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        !showSupportFundRedemption
                          ? 'border-black text-black'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Order Form
                    </button>
                    <button
                      onClick={() => setShowSupportFundRedemption(true)}
                      className={`py-4 px-1 border-b-2 font-medium text-sm ${
                        showSupportFundRedemption
                          ? 'border-green-600 text-green-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Distributor Support Funds
                      <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        ${totals.supportFundEarned.toFixed(2)} available
                      </span>
                    </button>
                  </nav>
                </div>
              </div>
            )}

            {/* Products Table */}
            <div className="bg-white rounded-lg shadow w-full">
              <div className="w-full">
                <table className="w-full table-auto divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-1 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Product
                      </th>
                      <th className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
                        SKU
                      </th>
                      <th className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell">
                        Size
                      </th>
                      <th className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell">
                        Pack
                      </th>
                      <th className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Price
                      </th>
                      <th className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Qty
                      </th>
                      <th className="px-1 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">
                        Units
                      </th>
                      <th className="px-1 py-2 pr-4 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      const productsToShow = showSupportFundRedemption 
                        ? products.filter(p => p.list_in_support_funds)
                        : products;
                      
                      const categorizedProducts = showSupportFundRedemption
                        ? [{ category: null, products: productsToShow }] // Support fund products don't need categorization
                        : getProductsByCategory();
                      
                      return categorizedProducts.map((categoryGroup, categoryIndex) => (
                        <React.Fragment key={categoryGroup.category?.id || 'no-category'}>
                          {/* Category Header Row */}
                          {!showSupportFundRedemption && (
                            <tr className="border-t-2 border-gray-300">
                              <td colSpan={6} className="px-4 py-4">
                                <div className="flex items-center">
                                  {categoryGroup.category?.image_url ? (
                                    <img
                                      src={categoryGroup.category.image_url}
                                      alt={categoryGroup.category.name}
                                      className="object-contain bg-white"
                                      style={{ 
                                        height: '45px',
                                        width: 'auto'
                                      }}
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    <h3 className="text-sm sm:text-base font-semibold text-gray-900">
                                      {categoryGroup.category?.name || 'Products without Category'}
                                    </h3>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          
                          {/* Products in this category */}
                          {categoryGroup.products.map((product) => {
                      const orderItem = showSupportFundRedemption 
                        ? supportFundItems.find(item => item.product_id === product.id)
                        : orderItems.find(item => item.product_id === product.id);
                      const unitPrice = getProductPrice(product);
                      
                        return (
                          <tr key={product.id} className={`hover:bg-gray-50 ${(orderItem?.case_qty || 0) > 0 ? 'bg-gray-100' : ''}`}>
                          <td className="px-1 py-2 max-w-0" style={{maxWidth: '200px'}}>
                            <div className="flex items-center min-w-0 w-full">
                              <div className="flex-shrink-0 h-6 w-6 rounded overflow-hidden bg-gray-200 mr-1">
                                {product.picture_url ? (
                                  <img
                                    src={product.picture_url}
                                    alt={product.item_name}
                                    className="h-6 w-6 object-cover"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const noImageDiv = e.currentTarget.nextElementSibling as HTMLElement;
                                      if (noImageDiv) noImageDiv.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className="h-6 w-6 flex items-center justify-center text-gray-400 text-xs"
                                  style={{display: product.picture_url ? 'none' : 'flex'}}
                                >
                                  •
                                </div>
                              </div>
                              <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="text-xs sm:text-sm font-medium text-gray-900 truncate w-full">
                                  {product.item_name}
                                </div>
                                {!showSupportFundRedemption && !product.qualifies_for_credit_earning && (
                                  <span className="inline-flex items-center px-1 py-0.5 rounded text-xs bg-red-100 text-red-800">
                                    No Credit
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-1 py-2 text-xs sm:text-sm text-gray-900 text-center hidden sm:table-cell" >
                            <div className="truncate">
                              {product.sku}
                            </div>
                          </td>
                          <td className="px-1 py-2 text-xs sm:text-sm text-gray-900 text-center hidden xl:table-cell" >
                            <div className="truncate">
                              {product.size}
                            </div>
                          </td>
                          <td className="px-1 py-2 text-xs sm:text-sm text-gray-900 text-center hidden xl:table-cell" >
                            {product.case_pack}
                          </td>
                          <td className="px-1 py-2 text-xs sm:text-sm text-gray-900 text-center" >
                            ${unitPrice.toFixed(2)}
                          </td>
                          <td className="px-1 py-2 text-center" >
                            <div className="inline-flex items-center border border-gray-300 rounded select-none justify-center">
                              <button
                                type="button"
                                onClick={() => showSupportFundRedemption 
                                  ? handleSupportFundItemChange(product.id, Math.max(0, (orderItem?.case_qty || 0) - 1))
                                  : handleCaseQtyChange(product.id, Math.max(0, (orderItem?.case_qty || 0) - 1))
                                }
                                className="px-1 py-1 text-gray-700 hover:bg-gray-100 focus:outline-none text-sm"
                              >
                                −
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={orderItem?.case_qty ?? 0}
                                onFocus={(e) => e.currentTarget.select()}
                                onChange={(e) => {
                                  const val = e.currentTarget.value.replace(/[^0-9]/g, '');
                                  if (val === '') {
                                    if (showSupportFundRedemption) {
                                      handleSupportFundItemChange(product.id, 0);
                                    } else {
                                      handleCaseQtyChange(product.id, 0);
                                    }
                                    return;
                                  }
                                  const parsed = Number(val);
                                  if (showSupportFundRedemption) {
                                    handleSupportFundItemChange(product.id, Math.max(0, Math.min(99, Math.floor(parsed))));
                                  } else {
                                    handleCaseQtyChange(product.id, Math.max(0, Math.min(99, Math.floor(parsed))));
                                  }
                                }}
                                className="w-8 px-1 py-1 text-center text-sm focus:outline-none focus:ring-1 focus:ring-black [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <button
                                type="button"
                                onClick={() => showSupportFundRedemption 
                                  ? handleSupportFundItemChange(product.id, (orderItem?.case_qty || 0) + 1)
                                  : handleCaseQtyChange(product.id, (orderItem?.case_qty || 0) + 1)
                                }
                                className="px-1 py-1 text-gray-700 hover:bg-gray-100 focus:outline-none text-sm"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-1 py-2 text-xs sm:text-sm text-gray-900 text-center hidden sm:table-cell" >
                            {orderItem?.total_units || 0}
                          </td>
                          <td className="px-1 py-2 pr-4 text-xs sm:text-sm font-medium text-gray-900 text-center" >
                            ${orderItem?.total_price?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                        );
                        })}
                        </React.Fragment>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile/Tablet Order Summary (visible below xl) */}
            <div className="xl:hidden bg-white rounded-lg shadow p-6 space-y-4">
              <h2 className="text-lg font-semibold">Order Summary</h2>
              {orderItems.length > 0 ? (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Items:</span>
                      <span className="font-medium">{orderItems.reduce((sum, item) => sum + item.total_units, 0) + supportFundItems.reduce((sum, item) => sum + item.total_units, 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cases:</span>
                      <span className="font-medium">{orderItems.reduce((sum, item) => sum + item.case_qty, 0) + supportFundItems.reduce((sum, item) => sum + item.case_qty, 0)}</span>
                    </div>
                    {totals.supportFundEarned > 0 && (
                      <div className="flex justify-between text-sm text-green-600">
                        <span>Support Fund ({totals.supportFundPercent}%):</span>
                        <span className="font-medium">${(totals.supportFundEarned - supportFundTotals.subtotal).toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-lg font-semibold">Total Order:</span>
                      <span className="text-lg font-semibold">${(totals.total + (supportFundTotals.remainingCredit < 0 ? Math.abs(supportFundTotals.remainingCredit) : 0)).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col space-y-2">
                    {showSupportFundRedemption ? (
                      <button
                        onClick={() => {
                          handleSubmitWithSupportFund();
                        }}
                        disabled={submitting || (orderItems.length === 0 && supportFundItems.length === 0)}
                        className="w-full bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                      >
                        {submitting ? 'Processing...' : 'Complete Order'}
                      </button>
                    ) : (
                      <>
                        {orderItems.length > 0 && (
                          <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                          >
                            {submitting ? 'Processing...' : 'Complete Order'}
                          </button>
                        )}
                      </>
                    )}
                    <Link
                      href="/client/orders"
                      className="w-full bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition text-center"
                    >
                      Cancel
                    </Link>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Please add items to your order</p>
                </div>
              )}
            </div>
          </div>

          {/* Right: sticky order summary (visible at xl+) */}
          <div className="hidden xl:block xl:col-span-1">
            <div className="bg-white rounded-lg shadow p-6 sticky top-6 space-y-4">
              <h2 className="text-lg font-semibold">Order Summary</h2>

              {orderItems.length > 0 ? (
                <>
                  {/* Order Form Products */}
                  <div className="space-y-2">
                    {orderItems.map((item) => (
                      <div key={item.product_id} className="flex items-center justify-between">
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="text-sm font-medium text-gray-900 truncate leading-tight">{item.product.item_name}</div>
                          <div className="text-xs text-gray-500 leading-tight">
                            {item.total_units} units • {item.case_qty} case{item.case_qty !== 1 ? 's' : ''}
                          </div>
                        </div>
                        <div className="text-sm font-medium text-gray-900">${item.total_price.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>

                  {/* Order Form Subtotal */}
                  {orderItems.length > 0 && (
                    <div className="flex justify-between text-sm font-medium text-gray-900 pt-2 border-t">
                      <span>Subtotal:</span>
                      <span>${orderItems.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}</span>
                    </div>
                  )}

                  {/* Credit Earned */}
                  {totals.supportFundPercent > 0 && (
                    <div className="flex justify-between text-sm text-green-600 pt-2">
                      <span>Credit Earned ({totals.supportFundPercent}%):</span>
                      <span className="font-medium">${totals.supportFundEarned.toFixed(2)}</span>
                    </div>
                  )}

                  {/* Support Fund Products Title */}
                  {supportFundItems.length > 0 && (
                    <div className="text-sm font-medium text-gray-700 uppercase tracking-wide mt-4">Support Fund Products</div>
                  )}

                  {/* Support Fund Products */}
                  {supportFundItems.length > 0 && (
                    <div className="space-y-2">
                      {supportFundItems.map((item) => (
                        <div key={`sf-${item.product_id}`} className="flex items-center justify-between bg-green-50 p-2 rounded">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-sm font-medium text-green-800 truncate leading-tight">{item.product.item_name}</div>
                            <div className="text-xs text-green-600 leading-tight">
                              {item.total_units} units • {item.case_qty} case{item.case_qty !== 1 ? 's' : ''} (Support Fund)
                            </div>
                          </div>
                          <div className="text-sm font-medium text-green-800">${item.total_price.toFixed(2)}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Support Fund Subtotal */}
                  {supportFundItems.length > 0 && (
                    <div className="flex justify-between text-sm font-medium text-green-800 pt-2 border-t border-green-200">
                      <span>Subtotal:</span>
                      <span>${supportFundItems.reduce((sum, item) => sum + item.total_price, 0).toFixed(2)}</span>
                    </div>
                  )}

                  {/* Remaining Credit */}
                  {supportFundItems.length > 0 && (
                    <div className="flex justify-between text-sm font-medium pt-2">
                      <span>Remaining Credit:</span>
                      <span className={(() => {
                        const creditEarned = totals.supportFundEarned;
                        const supportFundTotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
                        const remaining = creditEarned - supportFundTotal;
                        return remaining < 0 ? 'text-red-600' : 'text-green-600';
                      })()}>
                        {(() => {
                          const creditEarned = totals.supportFundEarned;
                          const supportFundTotal = supportFundItems.reduce((sum, item) => sum + item.total_price, 0);
                          const remaining = creditEarned - supportFundTotal;
                          return remaining < 0 ? `($${Math.abs(remaining).toFixed(2)})` : `$${remaining.toFixed(2)}`;
                        })()}
                      </span>
                    </div>
                  )}

                  {/* Support Fund Disclaimer */}
                  {supportFundItems.length > 0 && (
                    <div className="text-xs text-gray-500 italic pt-2 space-y-1">
                      <div>* Credit cannot be accumulated and must be redeemed in full per order</div>
                      <div>* Any unused Support Fund credit will be forfeited</div>
                      <div>* Negative remaining credit will be added to the grand total</div>
                    </div>
                  )}

                  {/* Totals */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Items:</span>
                      <span className="font-medium">{orderItems.reduce((sum, item) => sum + item.total_units, 0) + supportFundItems.reduce((sum, item) => sum + item.total_units, 0)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Cases:</span>
                      <span className="font-medium">{orderItems.reduce((sum, item) => sum + item.case_qty, 0) + supportFundItems.reduce((sum, item) => sum + item.case_qty, 0)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-lg font-semibold">Total Order:</span>
                      <span className="text-lg font-semibold">${(totals.total + (supportFundTotals.remainingCredit < 0 ? Math.abs(supportFundTotals.remainingCredit) : 0)).toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  {showSupportFundRedemption ? (
                    <button
                      onClick={() => {
                        handleSubmitWithSupportFund();
                      }}
                      disabled={submitting || (orderItems.length === 0 && supportFundItems.length === 0)}
                      className="mt-4 w-full bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                    >
                      {submitting ? 'Processing...' : 'Complete Order'}
                    </button>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {orderItems.length > 0 && (
                        <button
                          onClick={handleSubmit}
                          disabled={submitting}
                          className="w-full bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
                        >
                          {submitting ? 'Processing...' : 'Complete Order'}
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500">Please add items to your order</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
