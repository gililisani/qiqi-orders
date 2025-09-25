'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import ClientLayout from '../../../../components/ClientLayout';
import Card from '../../../../components/ui/Card';
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

interface Order {
  id: string;
  status: string;
  po_number: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  company?: {
    company_name: string;
  };
}

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
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

  // Format currency with thousand separators
  const formatCurrency = (amount: number) => {
    return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  useEffect(() => {
    if (company && order) {
      fetchProducts();
    }
  }, [company, order]);

  const fetchOrder = async () => {
    try {
      console.log('EditOrder: Fetching order data for ID:', orderId);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(company_name)
        `)
        .eq('id', orderId)
        .eq('user_id', user.id)
        .single();

      console.log('EditOrder: Order query result:', { data, error });

      if (error) throw error;
      
      // Check if order can be edited
      if (data.status !== 'Open') {
        setError('This order cannot be edited because its status is not "Open".');
        return;
      }
      
      setOrder(data);
      setPoNumber(data.po_number || '');
      
      // Fetch company data
      await fetchCompanyData();
      
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchCompanyData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select(`
          company_id,
          company:companies(
            id,
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            class:classes(name),
            subsidiary:subsidiaries(name),
            location:Locations(location_name)
          )
        `)
        .eq('id', user.id)
        .single();

      console.log('EditOrder: Company query result:', { clientData, clientError });
      console.log('EditOrder: Full clientData structure:', JSON.stringify(clientData, null, 2));

      if (clientError) throw clientError;
      
      // Try different ways to access company data
      console.log('EditOrder: clientData?.company:', clientData?.company);
      console.log('EditOrder: clientData?.company?.[0]:', clientData?.company?.[0]);
      
      // Handle different possible data structures
      let rawCompanyData: any = null;
      if (Array.isArray(clientData?.company)) {
        rawCompanyData = clientData.company[0];
      } else if (clientData?.company) {
        rawCompanyData = clientData.company;
      }
      
      console.log('EditOrder: Raw company data:', rawCompanyData);
      
      if (rawCompanyData) {
        // Handle the company data structure properly
        const companyData: Company = {
          id: rawCompanyData.id,
          company_name: rawCompanyData.company_name,
          netsuite_number: rawCompanyData.netsuite_number,
          support_fund: Array.isArray(rawCompanyData.support_fund) ? rawCompanyData.support_fund : (rawCompanyData.support_fund ? [rawCompanyData.support_fund] : []),
          class: Array.isArray(rawCompanyData.class) ? rawCompanyData.class[0] : rawCompanyData.class
        };
        console.log('EditOrder: Setting company data:', companyData);
        setCompany(companyData);
      }
      
    } catch (err: any) {
      console.error('Error fetching company data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const clientType = getClientType();
      const visibilityColumn = clientType === 'International' ? 'visible_to_international' : 'visible_to_americas';
      
      const { data, error } = await supabase
        .from('Products')
        .select(`
          *,
          category:categories(*)
        `)
        .eq(visibilityColumn, true)
        .order('item_name');

      if (error) throw error;
      setProducts(data || []);
      
      // Fetch existing order items after products are loaded
      await fetchOrderItems();
      
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setError(err.message);
    }
  };

  const fetchOrderItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(*)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      
      // Convert database items to our format
      const regularItems: OrderItem[] = [];
      const supportItems: OrderItem[] = [];
      
      data?.forEach(item => {
        if (item.product) {
          const orderItem: OrderItem = {
            product_id: item.product.id,
            product: item.product,
            case_qty: Math.ceil(item.quantity / item.product.case_pack), // Convert back to cases
            total_units: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price
          };
          
          if (item.is_support_fund_item) {
            supportItems.push(orderItem);
          } else {
            regularItems.push(orderItem);
          }
        }
      });
      
      setOrderItems(regularItems);
      setSupportFundItems(supportItems);
      
      // Keep Order Form tab as default, even if there are support fund items
      // User can manually switch to Support Fund tab if needed
      
    } catch (err: any) {
      console.error('Error fetching order items:', err);
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

  const handleSave = async () => {
    if (orderItems.length === 0) {
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
      const additionalCost = Math.max(0, supportTotals.subtotal - originalTotals.supportFundEarned);
      const finalTotal = originalTotals.total + additionalCost;

      // Generate PO number if not provided
      const finalPONumber = poNumber || generatePONumber();

      // Update the order
      const { error: orderError } = await supabase
        .from('orders')
        .update({
          po_number: finalPONumber,
          total_value: finalTotal,
          support_fund_used: supportFundUsed,
          credit_earned: originalTotals.supportFundEarned
        })
        .eq('id', orderId);

      if (orderError) throw orderError;

      // Delete existing order items
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);

      if (deleteError) throw deleteError;

      // Create order items (both regular and support fund items)
      const regularItemsData = orderItems.map((item, index) => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: false,
        sort_order: index
      }));

      const supportFundItemsData = supportFundItems.map((item, index) => ({
        order_id: orderId,
        product_id: item.product_id,
        quantity: item.total_units,
        unit_price: item.unit_price,
        total_price: item.total_price,
        is_support_fund_item: true,
        sort_order: orderItems.length + index // Continue numbering after regular items
      }));

      const allItemsData = [...regularItemsData, ...supportFundItemsData];

      if (allItemsData.length > 0) {
        const { error: insertError } = await supabase
          .from('order_items')
          .insert(allItemsData);

        if (insertError) throw insertError;
      }

      // Redirect back to order view
      router.push(`/client/orders/${orderId}`);
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="flex justify-center items-center min-h-64">
          <div className="text-lg">Loading order...</div>
        </div>
      </ClientLayout>
    );
  }

  if (error) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="text-red-600 text-lg font-medium mb-4">{error}</div>
          <Link
            href={`/client/orders/${orderId}`}
            className="text-blue-600 hover:text-blue-800"
          >
            ← Back to Order
          </Link>
        </div>
      </ClientLayout>
    );
  }

  if (!order || !company) {
    return (
      <ClientLayout>
        <div className="text-center py-8">
          <div className="text-gray-600 text-lg">Order not found</div>
        </div>
      </ClientLayout>
    );
  }

  const totals = getOrderTotals();
  const supportFundTotals = getSupportFundTotals();
  const clientType = getClientType();

  return (
    <ClientLayout>
      <div className="space-y-6">
        <div className="xl:grid xl:grid-cols-12 xl:gap-8">
          {/* Main Content */}
          <div className="xl:col-span-8 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Edit Order</h1>
                <p className="text-gray-600 mt-1">
                  {company.company_name} - {clientType} Pricing
                </p>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleSave}
                  disabled={submitting || orderItems.length === 0}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Updating...' : 'Update Order'}
                </button>
                <Link
                  href={`/client/orders/${orderId}`}
                  className="text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </Link>
              </div>
            </div>

            {/* PO Number */}
            <Card header={<h3 className="font-semibold">Order Details</h3>}>
              <div className="max-w-md px-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  PO/Cheque Number (Optional)
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="Enter PO/Cheque number or leave blank for auto-generation"
                  className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </Card>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {/* Tab Navigation */}
            {totals.supportFundPercent > 0 && (
              <Card>
                <div>
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
                        {formatCurrency(totals.supportFundEarned)} available
                      </span>
                    </button>
                  </nav>
                </div>
              </Card>
            )}

            {/* Products Table */}
            <Card>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider">Product</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider hidden sm:table-cell">SKU</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell">Size</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell">Pack</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap" style={{minWidth: '70px'}}>Price</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap">Qty</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell">Units</th>
                      <th className="px-4 py-3 pr-4 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap" style={{minWidth: '90px'}}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const productsToShow = showSupportFundRedemption 
                        ? products.filter(p => p.list_in_support_funds)
                        : products;
                      
                      const categorizedProducts = showSupportFundRedemption
                        ? getProductsByCategory().map(categoryGroup => ({
                            ...categoryGroup,
                            products: categoryGroup.products.filter(p => p.list_in_support_funds)
                          })).filter(categoryGroup => categoryGroup.products.length > 0)
                        : getProductsByCategory();
                      
                      return categorizedProducts.map((categoryGroup, categoryIndex) => (
                        <React.Fragment key={categoryGroup.category?.id || 'no-category'}>
                          {/* Category Header Row */}
                          {(
                            <tr className="border-t-2 border-gray-200">
                              <td colSpan={8} className="px-4 py-4">
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
                              <tr key={product.id} className={`hover:bg-gray-50 border-b border-gray-200 ${(orderItem?.case_qty || 0) > 0 ? 'bg-gray-100' : ''}`}>
                                <td className="px-4 py-3 max-w-0 relative overflow-visible" style={{maxWidth: '200px'}}>
                                  <div className="flex items-center min-w-0 w-full">
                                    <div className="flex-shrink-0 h-8 w-8 sm:h-10 sm:w-10 rounded overflow-visible">
                                      {product.picture_url ? (
                                        <img
                                          src={product.picture_url}
                                          alt={product.item_name}
                                          className="h-8 w-8 sm:h-10 sm:w-10 object-cover cursor-pointer transition-transform duration-200 hover:scale-[3] hover:z-50 hover:relative"
                                          onError={(e) => {
                                            console.error('Image failed to load:', product.picture_url);
                                            e.currentTarget.style.display = 'none';
                                            const noImageDiv = e.currentTarget.nextElementSibling as HTMLElement;
                                            if (noImageDiv) noImageDiv.style.display = 'flex';
                                          }}
                                        />
                                      ) : null}
                                      <div 
                                        className="h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center text-gray-400 text-xs"
                                        style={{display: product.picture_url ? 'none' : 'flex'}}
                                      >
                                        No Image
                                      </div>
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="text-xs sm:text-sm font-medium text-gray-900 truncate w-full">
                                        {product.item_name}
                                      </div>
                                      {!showSupportFundRedemption && !product.qualifies_for_credit_earning && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mt-1">
                                          Not Eligible for Credit
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden sm:table-cell">
                                  <div className="truncate" title={product.sku}>
                                    {product.sku}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden xl:table-cell">
                                  <div className="truncate" title={product.size}>
                                    {product.size}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden xl:table-cell">
                                  {product.case_pack}
                                </td>
                                <td className="px-4 py-3 text-xs sm:text-sm text-gray-900 text-center">
                                  {formatCurrency(unitPrice)}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-center">
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
                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 text-center hidden sm:table-cell">
                                  {orderItem?.total_units || 0}
                                </td>
                                <td className="px-4 py-3 pr-4 text-xs sm:text-sm font-medium text-gray-900 text-center">
                                  {orderItem?.total_price ? formatCurrency(orderItem.total_price) : '$0.00'}
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
            </Card>

          </div>

          {/* Responsive Sidebar */}
          <div className="xl:col-span-4 xl:mt-0 mt-6">
            <div className="sticky top-8 space-y-6">
              {/* Order Summary */}
              <Card header={<h2 className="font-semibold">Order Summary</h2>}>
                {orderItems.length > 0 ? (
                  <>
                    {/* Order Form Products */}
                    <div className="space-y-2 px-6">
                      {orderItems.map((item) => (
                        <div key={item.product_id} className="flex items-center justify-between">
                          <div className="flex-1 min-w-0 pr-2">
                            <div className="text-xs font-medium text-gray-900 truncate leading-tight">{item.product.item_name}</div>
                            <div className="text-xs text-gray-500 leading-tight">
                              {item.total_units} units • {item.case_qty} case{item.case_qty !== 1 ? 's' : ''}
                            </div>
                          </div>
                          <div className="text-xs font-medium text-gray-900">{formatCurrency(item.total_price)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Order Form Subtotal */}
                    {orderItems.length > 0 && (
                      <div className="px-6">
                        <div className="pt-2 border-t">
                          <div className="flex justify-between text-base font-bold text-gray-900">
                            <span>Subtotal:</span>
                            <span>{formatCurrency(orderItems.reduce((sum, item) => sum + item.total_price, 0))}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Credit Earned */}
                    {totals.supportFundPercent > 0 && (
                      <div className="flex justify-between text-sm text-green-600 pt-2 px-6">
                        <span>Credit Earned ({totals.supportFundPercent}%):</span>
                        <span className="font-medium">{formatCurrency(totals.supportFundEarned)}</span>
                      </div>
                    )}

                    {/* Support Fund Products Title */}
                    {supportFundItems.length > 0 && (
                      <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mt-4 px-6 pb-2 border-b border-gray-200 mb-4">Support Fund Products</div>
                    )}

                    {/* Support Fund Products */}
                    {supportFundItems.length > 0 && (
                      <div className="space-y-2 px-6 pb-4">
                        {supportFundItems.map((item) => (
                          <div key={`sf-${item.product_id}`} className="flex items-center justify-between bg-green-50 p-2 rounded">
                            <div className="flex-1 min-w-0 pr-2">
                              <div className="text-xs font-medium text-green-800 truncate leading-tight">{item.product.item_name}</div>
                              <div className="text-xs text-green-600 leading-tight">
                                {item.total_units} units • {item.case_qty} case{item.case_qty !== 1 ? 's' : ''} (Support Fund)
                              </div>
                            </div>
                            <div className="text-xs font-medium text-green-800">{formatCurrency(item.total_price)}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Support Fund Subtotal */}
                    {supportFundItems.length > 0 && (
                      <div className="px-6">
                        <div className="pt-2 border-t border-green-200">
                          <div className="flex justify-between text-sm font-medium text-green-800">
                            <span>Subtotal:</span>
                            <span>{formatCurrency(supportFundItems.reduce((sum, item) => sum + item.total_price, 0))}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Credit Used */}
                    {supportFundItems.length > 0 && (
                      <div className="flex justify-between text-sm font-medium pt-2 px-6">
                        <span>Credit Used:</span>
                        <span className="text-green-600">
                          {formatCurrency(Math.min(supportFundItems.reduce((sum, item) => sum + item.total_price, 0), totals.supportFundEarned))}
                        </span>
                      </div>
                    )}

                    {/* Remaining Credit */}
                    {supportFundItems.length > 0 && (
                      <div className="flex justify-between text-sm font-medium pt-2 px-6">
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
                            return remaining < 0 ? `(${formatCurrency(Math.abs(remaining))})` : formatCurrency(remaining);
                          })()}
                        </span>
                      </div>
                    )}

                    {/* Support Fund Disclaimer */}
                    {supportFundItems.length > 0 && (
                      <div className="px-6 pb-4">
                        <div className="text-xs text-gray-500 italic pt-2 space-y-1">
                          <div>* Credit cannot be accumulated and must be redeemed in full per order</div>
                          <div>* Any unused Support Fund credit will be forfeited</div>
                          <div>* Negative remaining credit will be added to the grand total</div>
                        </div>
                      </div>
                    )}

                    {/* Totals */}
                    <div className="space-y-2 pt-2 border-t px-6">
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
                        <span className="text-lg font-semibold">{formatCurrency(totals.total + (supportFundTotals.remainingCredit < 0 ? Math.abs(supportFundTotals.remainingCredit) : 0))}</span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="mt-4 space-y-2 px-6 pb-6">
                      <button
                        onClick={handleSave}
                        disabled={submitting || (orderItems.length === 0 && supportFundItems.length === 0)}
                        className="w-full bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition disabled:opacity-50"
                      >
                        {submitting ? 'Updating...' : 'Update Order'}
                      </button>
                      <Link
                        href={`/client/orders/${orderId}`}
                        className="w-full bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition text-center block"
                      >
                        Cancel
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No items selected</p>
                  </div>
                )}
              </Card>

            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}