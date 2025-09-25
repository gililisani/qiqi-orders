'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../ui/Card';
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

interface SupportFundItem {
  product_id: number;
  product: Product;
  case_qty: number;
  total_units: number;
  unit_price: number;
  total_price: number;
}

interface Order {
  id: string;
  po_number?: string;
  status: string;
  company_id: string;
  company?: Company;
}

interface OrderFormViewProps {
  role: 'admin' | 'client';
  orderId?: string | null;
  backUrl: string;
}

export default function OrderFormView({ role, orderId, backUrl }: OrderFormViewProps) {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [supportFundItems, setSupportFundItems] = useState<SupportFundItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSupportFundRedemption, setShowSupportFundRedemption] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('');

  const isEditMode = !!orderId;
  const isNewMode = !orderId;

  useEffect(() => {
    if (isEditMode && orderId) {
      fetchOrder();
    } else {
      setLoading(true);
      // Initialize order for new mode
      setOrder({ id: '', po_number: '', status: 'Open', company_id: '' });
      fetchProducts();
      if (role === 'admin') {
        fetchCompanies();
      }
    }
  }, [orderId, role]);

  const fetchOrder = async () => {
    try {
      setLoading(true);
      
      // For clients, first verify they can access this order
      if (role === 'client') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user found');

        // Check if this order belongs to the client
        const { data: orderCheck, error: orderCheckError } = await supabase
          .from('orders')
          .select(`
            id,
            status,
            user_id,
            company:companies(
              id,
              clients!inner(id)
            )
          `)
          .eq('id', orderId)
          .eq('user_id', user.id)
          .single();

        if (orderCheckError || !orderCheck) {
          throw new Error('Order not found or access denied');
        }

        // Check if user can edit this order (only Open status)
        if (orderCheck.status !== 'Open') {
          setError('You can only edit orders with "Open" status');
          setLoading(false);
          return;
        }
      }
      
      // Fetch order with company details
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          company:companies(
            *,
            support_fund:support_fund_levels(percent),
            class:classes(name)
          )
        `)
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;
      
      setOrder(orderData);

      // Set company
      if (orderData.company) {
        setCompany(orderData.company);
        setSelectedCompanyId(orderData.company.id);
      }

      // Fetch order items
      const { data: orderItemsData, error: orderItemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(*)
        `)
        .eq('order_id', orderId)
        .eq('is_support_fund_item', false);

      if (orderItemsError) throw orderItemsError;
      setOrderItems(orderItemsData || []);

      // Fetch support fund items
      const { data: supportFundItemsData, error: supportFundItemsError } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(*)
        `)
        .eq('order_id', orderId)
        .eq('is_support_fund_item', true);

      if (supportFundItemsError) throw supportFundItemsError;
      setSupportFundItems(supportFundItemsData || []);

      // Fetch products for the company
      if (orderData.company) {
        await fetchProductsForCompany(orderData.company);
      }

      if (role === 'admin') {
        fetchCompanies();
      }

    } catch (error) {
      console.error('Error fetching order:', error);
      setError(error instanceof Error ? error.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  };

  const fetchProductsForCompany = async (companyData: Company) => {
    const classFilter = companyData.class?.name === 'Americas' ? 'americas' : 'international';
    
    const { data: productsData, error: productsError } = await supabase
      .from('Products')
      .select(`
        *,
        category:categories(*)
      `)
      .eq(`visible_to_${classFilter}`, true)
      .order('item_name');

    if (productsError) throw productsError;
    setProducts(productsData || []);
    setLoading(false);
  };

  const fetchProducts = async () => {
    try {
      if (role === 'client') {
        // For clients, fetch user's company first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('No user found');

        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select(`
            *,
            company:companies(
              *,
              support_fund:support_fund_levels(percent),
              class:classes(name)
            )
          `)
          .eq('id', user.id)
          .single();

        if (clientError) throw clientError;
        
        if (clientData.company) {
          setCompany(clientData.company);
          await fetchProductsForCompany(clientData.company);
        } else {
          setError('No company found for client');
          setLoading(false);
        }
      } else {
        // For admin, we don't fetch products until a company is selected
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching products:', error);
      setError('Failed to load products');
      setLoading(false);
    }
  };

  const fetchCompanies = async () => {
    try {
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select(`
          *,
          class:classes(name),
          support_fund:support_fund_levels(percent)
        `)
        .order('company_name');

      if (companiesError) throw companiesError;
      setCompanies(companiesData || []);
    } catch (error) {
      console.error('Error fetching companies:', error);
      setError('Failed to load companies');
    }
  };

  const handleCompanyChange = async (companyId: string) => {
    setSelectedCompanyId(companyId);
    const selectedCompany = companies.find(c => c.id === companyId);
    if (selectedCompany) {
      setCompany(selectedCompany);
      setLoading(true);
      try {
        await fetchProductsForCompany(selectedCompany);
        // Clear existing items when company changes
        setOrderItems([]);
        setSupportFundItems([]);
      } catch (error) {
        console.error('Error fetching products for company:', error);
        setError('Failed to load products for selected company');
      } finally {
        setLoading(false);
      }
    }
  };

  const getProductPrice = (product: Product): number => {
    if (!company) return 0;
    return company.class?.name === 'Americas' ? product.price_americas : product.price_international;
  };

  const getProductsByCategory = () => {
    const categorized: { [key: string]: { category: Category | null, products: Product[] } } = {};
    
    // First, get all visible categories for this client
    const isInternational = company?.class?.name?.includes('International') || false;
    console.log('getProductsByCategory - company class:', company?.class?.name);
    console.log('getProductsByCategory - isInternational:', isInternational);
    console.log('getProductsByCategory - products count:', products.length);
    console.log('getProductsByCategory - sample product categories:', products.slice(0, 3).map(p => ({ name: p.item_name, category: p.category?.name, visible_to_americas: p.category?.visible_to_americas, visible_to_international: p.category?.visible_to_international })));
    
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

  const handleCaseQtyChange = (productId: number, newQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = newQty * product.case_pack;
    const totalPrice = totalUnits * unitPrice;

    setOrderItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      const newItem = {
        product_id: productId,
        product,
        case_qty: newQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        if (newQty === 0) {
          return prev.filter(item => item.product_id !== productId);
        } else {
          const updated = [...prev];
          updated[existingIndex] = newItem;
          return updated;
        }
      } else if (newQty > 0) {
        return [...prev, newItem];
      }
      return prev;
    });
  };

  const handleSupportFundItemChange = (productId: number, newQty: number) => {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const unitPrice = getProductPrice(product);
    const totalUnits = newQty * product.case_pack;
    const totalPrice = totalUnits * unitPrice;

    setSupportFundItems(prev => {
      const existingIndex = prev.findIndex(item => item.product_id === productId);
      const newItem = {
        product_id: productId,
        product,
        case_qty: newQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice
      };

      if (existingIndex >= 0) {
        if (newQty === 0) {
          return prev.filter(item => item.product_id !== productId);
        } else {
          const updated = [...prev];
          updated[existingIndex] = newItem;
          return updated;
        }
      } else if (newQty > 0) {
        return [...prev, newItem];
      }
      return prev;
    });
  };

  const getOrderTotals = () => {
    const subtotal = orderItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // Only include products that qualify for credit earning
    const creditEarningItems = orderItems.filter(item => item.product.qualifies_for_credit_earning);
    const creditEarningSubtotal = creditEarningItems.reduce((sum, item) => sum + item.total_price, 0);
    
    // Support fund percent can arrive as array or single
    const rawSf = company?.support_fund as any;
    const supportFundPercent = Array.isArray(rawSf)
      ? (rawSf[0]?.percent || 0)
      : (rawSf?.percent || 0);
    const supportFundEarned = creditEarningSubtotal * (supportFundPercent / 100);
    
    return {
      subtotal,
      supportFundPercent,
      supportFundEarned,
      total: subtotal
    };
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      if (!company) {
        throw new Error('No company selected');
      }

      if (isNewMode) {
        // Create new order
        const { data: newOrder, error: orderError } = await supabase
          .from('orders')
          .insert({
            company_id: company.id,
            po_number: (order && order.po_number) || null,
            status: 'Open'
          })
          .select()
          .single();

        if (orderError) throw orderError;

        // Insert order items
        const regularItemsData = orderItems.map((item, index) => ({
          order_id: newOrder.id,
          product_id: item.product_id,
          quantity: item.total_units,
          unit_price: item.unit_price,
          total_price: item.total_price,
          is_support_fund_item: false,
          sort_order: index
        }));

        const supportFundItemsData = supportFundItems.map((item, index) => ({
          order_id: newOrder.id,
          product_id: item.product_id,
          quantity: item.total_units,
          unit_price: item.unit_price,
          total_price: item.total_price,
          is_support_fund_item: true,
          sort_order: orderItems.length + index
        }));

        const allItemsData = [...regularItemsData, ...supportFundItemsData];

        if (allItemsData.length > 0) {
          const { error: insertError } = await supabase
            .from('order_items')
            .insert(allItemsData);

          if (insertError) throw insertError;
        }

        // Redirect to order view
        router.push(`/${role}/orders/${newOrder.id}`);
      } else {
        // Update existing order
        const originalTotals = getOrderTotals();
        const supportTotals = getSupportFundTotals();
        
        const supportFundUsed = Math.min(supportTotals.subtotal, originalTotals.supportFundEarned);
        const additionalCost = Math.max(0, supportTotals.subtotal - originalTotals.supportFundEarned);
        const finalTotal = originalTotals.total + additionalCost;

        const { error: updateError } = await supabase
          .from('orders')
          .update({
            po_number: (order && order.po_number) || null,
            total_value: finalTotal,
            support_fund_used: supportFundUsed,
            credit_earned: originalTotals.supportFundEarned
          })
          .eq('id', orderId);

        if (updateError) throw updateError;

        // Delete existing order items
        const { error: deleteError } = await supabase
          .from('order_items')
          .delete()
          .eq('order_id', orderId);

        if (deleteError) throw deleteError;

        // Insert updated order items
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
          sort_order: orderItems.length + index
        }));

        const allItemsData = [...regularItemsData, ...supportFundItemsData];

        if (allItemsData.length > 0) {
          const { error: insertError } = await supabase
            .from('order_items')
            .insert(allItemsData);

          if (insertError) throw insertError;
        }

        // Redirect back to order view
        router.push(`/${role}/orders/${orderId}`);
      }
    } catch (error) {
      console.error('Error saving order:', error);
      setError(error instanceof Error ? error.message : 'Failed to save order');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  const totals = getOrderTotals();
  const supportFundTotals = getSupportFundTotals();

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isNewMode ? 'New Order' : 'Edit Order'}
          </h1>
          <p className="text-gray-600 mt-1">
            {isNewMode ? 'Create a new order' : `Edit order ${order?.po_number || orderId}`}
          </p>
        </div>
        <Link
          href={backUrl}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">{error}</div>
        </div>
      )}

      {/* Company Selection (Admin only, New orders only) */}
      {role === 'admin' && isNewMode && (
        <Card>
          <div className="px-6 py-4 border-b border-[#e5e5e5]">
            <h3 className="text-lg font-semibold text-gray-900">Select Customer</h3>
          </div>
          <div className="px-6 py-4">
            <div className="max-w-md">
              <label htmlFor="company-select" className="block text-sm font-medium text-gray-700 mb-2">
                Company
              </label>
              <select
                id="company-select"
                value={selectedCompanyId}
                onChange={(e) => handleCompanyChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a company...</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.company_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* PO Number (Client only, New orders only) */}
      {role === 'client' && isNewMode && (
        <Card>
          <div className="px-6 py-4 border-b border-[#e5e5e5]">
            <h3 className="text-lg font-semibold text-gray-900">Order Information</h3>
          </div>
          <div className="px-6 py-4">
            <div className="max-w-md">
              <label htmlFor="po-number" className="block text-sm font-medium text-gray-700 mb-2">
                PO Number (Optional)
              </label>
              <input
                type="text"
                id="po-number"
                value={(order && order.po_number) || ''}
                onChange={(e) => setOrder(prev => prev ? { ...prev, po_number: e.target.value } : { id: '', po_number: e.target.value, status: 'Open', company_id: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter PO number..."
              />
            </div>
          </div>
        </Card>
      )}

      {/* Company Info */}
      {company && (
        <Card>
          <div className="px-6 py-4 border-b border-[#e5e5e5]">
            <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Company Name</label>
                <div className="text-sm text-gray-900">{company.company_name}</div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Support Fund</label>
                <div className="text-sm text-gray-900">
                  {(() => {
                    const rawSf = company.support_fund as any;
                    const supportFundPercent = Array.isArray(rawSf)
                      ? (rawSf[0]?.percent || 0)
                      : (rawSf?.percent || 0);
                    return `${supportFundPercent}%`;
                  })()}
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Navigation */}
      {company && (
        <Card>
          <div className="px-6 py-4">
            <nav className="flex space-x-8">
              <button
                onClick={() => setShowSupportFundRedemption(false)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  !showSupportFundRedemption
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Order Form
              </button>
              <button
                onClick={() => setShowSupportFundRedemption(true)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
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

      {/* Products Table and Order Summary Layout */}
      {company && products.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-8 gap-6">
          {/* Products Table - Takes up 5 columns on xl, full width on smaller screens */}
          <div className="xl:col-span-5">
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
                                  {!product.qualifies_for_credit_earning && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 mt-1">
                                      Not Eligible for Credit
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600 break-all max-w-[120px]">
                              {product.sku}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600 hidden xl:table-cell">
                              {product.size}
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600 hidden xl:table-cell">
                              {product.case_pack}
                            </td>
                            <td className="px-4 py-3 text-center text-xs font-medium text-gray-900">
                              {formatCurrency(unitPrice)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => {
                                    const currentQty = orderItem?.case_qty || 0;
                                    const newQty = Math.max(0, currentQty - 1);
                                    if (showSupportFundRedemption) {
                                      handleSupportFundItemChange(product.id, newQty);
                                    } else {
                                      handleCaseQtyChange(product.id, newQty);
                                    }
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-800"
                                >
                                  -
                                </button>
                                <span className="text-sm font-medium text-gray-900 min-w-[2rem] text-center">
                                  {orderItem?.case_qty || 0}
                                </span>
                                <button
                                  onClick={() => {
                                    const currentQty = orderItem?.case_qty || 0;
                                    const newQty = currentQty + 1;
                                    if (showSupportFundRedemption) {
                                      handleSupportFundItemChange(product.id, newQty);
                                    } else {
                                      handleCaseQtyChange(product.id, newQty);
                                    }
                                  }}
                                  className="w-6 h-6 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-800"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-gray-600 hidden sm:table-cell">
                              {orderItem ? orderItem.total_units : 0}
                            </td>
                            <td className="px-4 py-3 pr-4 text-center text-xs font-medium text-gray-900">
                              {orderItem ? formatCurrency(orderItem.total_price) : '$0.00'}
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

          {/* Order Summary - Takes up 3 columns on xl, full width on smaller screens */}
          <div className="xl:col-span-3">
          <Card>
            <div className="px-6 py-4 border-b border-[#e5e5e5]">
              <h3 className="text-lg font-semibold text-gray-900">Order Summary</h3>
            </div>
            <div className="px-6 py-4">
              {/* Order Form Products */}
              {orderItems.length > 0 && (
                <div className="space-y-2 px-6">
                  {orderItems.map((item) => (
                    <div key={`order-${item.product_id}`} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                      <div className="flex-1 min-w-0 pr-2">
                        <div className="text-xs font-medium text-gray-900 truncate leading-tight">{item.product.item_name}</div>
                        <div className="text-xs text-gray-600 leading-tight">
                          {item.total_units} units • {item.case_qty} case{item.case_qty !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <div className="text-xs font-medium text-gray-900">{formatCurrency(item.total_price)}</div>
                    </div>
                  ))}
                </div>
              )}

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
              {orderItems.length > 0 && totals.supportFundEarned > 0 && (
                <div className="px-6">
                  <div className="pt-2">
                    <div className="flex justify-between text-sm font-medium text-green-600">
                      <span>Credit Earned:</span>
                      <span>{formatCurrency(totals.supportFundEarned)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Support Fund Products */}
              {supportFundItems.length > 0 && (
                <div className="space-y-2 px-6 pb-4">
                  <div className="text-sm font-bold text-gray-700 uppercase tracking-wide mt-4 px-6 pb-2 border-b border-gray-200 mb-4">Support Fund Products</div>
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
                    {formatCurrency(Math.min(supportFundTotals.subtotal, totals.supportFundEarned))}
                  </span>
                </div>
              )}

              {/* Remaining Credit */}
              {supportFundItems.length > 0 && (
                <div className="px-6 pb-4">
                  <div className="pt-2 border-t">
                    <div className="flex justify-between text-sm font-medium text-gray-900">
                      <span>Remaining Credit:</span>
                      <span className="text-green-600">
                        {formatCurrency(supportFundTotals.remainingCredit)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              {supportFundItems.length > 0 && (
                <div className="px-6 pb-4">
                  <div className="text-xs text-gray-500 italic pt-2 space-y-1">
                    <div>* Negative remaining credit will be added to the grand total</div>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="px-6">
                <div className="pt-2 border-t">
                  <div className="flex justify-between text-lg font-semibold text-gray-900">
                    <span>Grand Total:</span>
                    <span>{formatCurrency(totals.subtotal + supportFundTotals.finalTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-6 pb-6 pt-4">
                <div className="flex space-x-3">
                  <button
                    onClick={handleSave}
                    disabled={saving || !company}
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {saving ? 'Saving...' : (isNewMode ? 'Create Order' : 'Save Changes')}
                  </button>
                  <Link
                    href={backUrl}
                    className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </Link>
                </div>
              </div>
            </div>
          </Card>
          </div>
        </div>
      )}

    </div>
  );
}
