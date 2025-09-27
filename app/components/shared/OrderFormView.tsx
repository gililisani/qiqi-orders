'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../ui/Card';
import Link from 'next/link';
import Image from 'next/image';

// CategoryAccordion Component
interface CategoryAccordionProps {
  categoryGroup: any;
  categoryId: number;
  isExpanded: boolean;
  onToggle: () => void;
  showSupportFundRedemption: boolean;
  supportFundItems: any[];
  orderItems: any[];
  getProductPrice: (product: any) => number;
  handleSupportFundItemChange: (productId: number, qty: number) => void;
  handleCaseQtyChange: (productId: number, qty: number) => void;
  formatCurrency: (amount: number) => string;
  highlightedProductId: string | null;
}

const CategoryAccordion: React.FC<CategoryAccordionProps> = ({
  categoryGroup,
  categoryId,
  isExpanded,
  onToggle,
  showSupportFundRedemption,
  supportFundItems,
  orderItems,
  getProductPrice,
  handleSupportFundItemChange,
  handleCaseQtyChange,
  formatCurrency,
  highlightedProductId
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Handle height animation when expanded state changes
  useEffect(() => {
    if (contentRef.current) {
      if (isExpanded) {
        contentRef.current.style.maxHeight = contentRef.current.scrollHeight + 'px';
      } else {
        contentRef.current.style.maxHeight = '0px';
      }
    }
  }, [isExpanded]);
  
  return (
    <div id={`accordion-${categoryId}`}>
      {/* Category Accordion Header */}
      <button
        onClick={onToggle}
        className="w-full flex justify-between items-center py-5 px-6 text-slate-800 hover:bg-gray-50 transition-colors duration-200 border-b border-slate-200"
      >
        <div className="flex items-center">
          {categoryGroup.category?.image_url && categoryGroup.category.image_url !== 'null' ? (
            <img
              src={`${categoryGroup.category.image_url}?t=${Date.now()}`}
              alt={categoryGroup.category.name}
              className="object-contain mr-3"
              style={{ 
                height: '32px',
                width: 'auto'
              }}
              onError={(e) => {
                console.error('Image failed to load:', categoryGroup.category.image_url);
                e.currentTarget.style.display = 'none';
              }}
            />
          ) : null}
          <span className="ml-2 text-xs text-slate-500">
            {showSupportFundRedemption ? (
              <span className="text-green-600">
                ({categoryGroup.products.length} products to redeem)
              </span>
            ) : (
              `(${categoryGroup.products.length} products)`
            )}
          </span>
        </div>
        <span className="text-slate-800 transition-transform duration-300 pr-2">
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            viewBox="0 0 16 16" 
            fill="currentColor" 
            className={`w-5 h-5 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path 
              fillRule="evenodd" 
              d="M11.78 9.78a.75.75 0 0 1-1.06 0L8 7.06 5.28 9.78a.75.75 0 0 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06Z" 
              clipRule="evenodd" 
            />
          </svg>
        </span>
      </button>
      
      {/* Category Products - Collapsible Content with smooth animation */}
      <div 
        ref={contentRef}
        className="max-h-0 overflow-hidden transition-all duration-300 ease-in-out"
      >
        <div className="pb-5">
          <div className="overflow-x-auto">
            <table className="w-full" style={{tableLayout: 'fixed', width: '100%', maxWidth: '100%'}}>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-2 py-3 text-left text-xs font-medium text-gray-900 uppercase tracking-wider" style={{width: '50%'}}>Product</th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider hidden sm:table-cell" style={{width: '12.5%'}}>SKU</th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell" style={{width: '8.3%'}}>Size</th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap hidden xl:table-cell" style={{width: '8.3%'}}>Pack</th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap" style={{width: '20%'}}>Price</th>
                  <th className="px-1 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap" style={{width: '15%'}}>Qty</th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap hidden sm:table-cell" style={{width: '8.3%'}}>Units</th>
                  <th className="px-2 py-3 text-center text-xs font-medium text-gray-900 uppercase tracking-wider whitespace-nowrap" style={{width: '15%'}}>Total</th>
                </tr>
              </thead>
              <tbody>
                {categoryGroup.products.map((product: any) => {
                  const orderItem = showSupportFundRedemption 
                    ? supportFundItems.find(item => item.product_id === product.id)
                    : orderItems.find(item => item.product_id === product.id);
                  const unitPrice = getProductPrice(product);
                  
                  return (
                    <tr key={product.id} className={`hover:bg-gray-50 border-b border-gray-200 ${(orderItem?.case_qty || 0) > 0 ? 'bg-gray-100' : ''} ${highlightedProductId === product.id.toString() ? 'bg-slate-200 animate-pulse' : ''}`}>
                      <td className="px-2 py-3 relative" style={{width: '50%'}}>
                        <div className="flex items-center min-w-0 w-full">
                          <div className="flex-shrink-0 h-6 w-6 sm:h-8 sm:w-8 rounded">
                            {product.picture_url ? (
                              <img
                                src={product.picture_url}
                                alt={product.item_name}
                                className="h-6 w-6 sm:h-8 sm:w-8 object-cover cursor-pointer transition-transform duration-200 hover:scale-[3] hover:z-50 hover:relative"
                                onError={(e) => {
                                  console.error('Image failed to load:', product.picture_url);
                                  e.currentTarget.style.display = 'none';
                                  const noImageDiv = e.currentTarget.nextElementSibling as HTMLElement;
                                  if (noImageDiv) noImageDiv.style.display = 'flex';
                                }}
                              />
                            ) : null}
                            <div 
                              className="h-6 w-6 sm:h-8 sm:w-8 flex items-center justify-center text-gray-400 text-xs"
                              style={{display: product.picture_url ? 'none' : 'flex'}}
                            >
                              No Image
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 ml-2" style={{overflow: 'hidden'}}>
                            <div 
                              className="text-xs sm:text-sm font-medium text-gray-900"
                              style={{
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: '100%'
                              }}
                              title={product.item_name}
                            >
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
                      <td className="px-2 py-3 text-center text-xs text-gray-600 break-all hidden sm:table-cell" style={{width: '12.5%'}}>
                        {product.sku}
                      </td>
                      <td className="px-2 py-3 text-center text-xs text-gray-600 hidden xl:table-cell" style={{width: '8.3%'}}>
                        {product.size}
                      </td>
                      <td className="px-2 py-3 text-center text-xs text-gray-600 hidden xl:table-cell" style={{width: '8.3%'}}>
                        {product.case_pack}
                      </td>
                      <td className="px-2 py-3 text-center text-xs font-medium text-gray-900" style={{width: '20%'}}>
                        {formatCurrency(unitPrice)}
                      </td>
                      <td className="px-1 py-3 text-center" style={{width: '15%'}}>
                        <div className="flex items-center justify-center space-x-1">
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
                            className="w-4 h-4 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-800 text-xs"
                          >
                            -
                          </button>
                          <input
                            type="text"
                            value={orderItem?.case_qty || 0}
                            onChange={(e) => {
                              const newQty = Math.max(0, parseInt(e.target.value) || 0);
                              if (showSupportFundRedemption) {
                                handleSupportFundItemChange(product.id, newQty);
                              } else {
                                handleCaseQtyChange(product.id, newQty);
                              }
                            }}
                            className="w-8 h-4 text-center text-xs font-medium text-gray-900 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
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
                            className="w-4 h-4 flex items-center justify-center rounded-full border border-gray-300 hover:bg-gray-50 text-gray-600 hover:text-gray-800 text-xs"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-center text-xs text-gray-600 hidden sm:table-cell" style={{width: '8.3%'}}>
                        {orderItem ? orderItem.total_units : 0}
                      </td>
                      <td className="px-2 py-3 text-center text-xs font-medium text-gray-900" style={{width: '15%'}}>
                        {orderItem ? formatCurrency(orderItem.total_price) : '$0.00'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

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
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  const isEditMode = !!orderId;
  const isNewMode = !orderId;

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const newSet = new Set<number>();
      // If the clicked category is already expanded, close it (leave newSet empty)
      // If it's not expanded, open only this category (close all others)
      if (!prev.has(categoryId)) {
        newSet.add(categoryId);
      }
      return newSet;
    });
  };

  const scrollToProduct = (productId: string, isSupportFundProduct: boolean = false) => {
    // Switch to the correct tab first
    if (isSupportFundProduct && !showSupportFundRedemption) {
      setShowSupportFundRedemption(true);
    } else if (!isSupportFundProduct && showSupportFundRedemption) {
      setShowSupportFundRedemption(false);
    }
    
    // Set highlighted product
    setHighlightedProductId(productId);
    
    // Find the category that contains this product
    const categoryGroups = getProductsByCategory();
    for (const categoryGroup of categoryGroups) {
      const product = categoryGroup.products.find(p => p.id === parseInt(productId));
      if (product) {
        // Open the accordion and scroll to it
        const categoryId = categoryGroup.category?.id || 0;
        setExpandedCategories(new Set([categoryId]));
        
        // Scroll to the accordion after a short delay to ensure it's rendered
        setTimeout(() => {
          const accordionElement = document.getElementById(`accordion-${categoryId}`);
          if (accordionElement) {
            accordionElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
        
        // Remove highlight after 3 seconds
        setTimeout(() => {
          setHighlightedProductId(null);
        }, 3000);
        break;
      }
    }
  };

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

  // Force refresh category data when component mounts to get latest images
  useEffect(() => {
    const refreshCategoryData = async () => {
      if (products.length > 0) {
        // Re-fetch products to get latest category data
        if (role === 'client' && company) {
          await fetchProductsForCompany(company);
        } else if (role === 'admin' && company) {
          await fetchProductsForCompany(company);
        }
      }
    };

    // Small delay to ensure initial data is loaded
    const timer = setTimeout(refreshCategoryData, 1000);
    return () => clearTimeout(timer);
  }, [products.length, role, company]);

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
    const classFilter = companyData.class?.name?.toLowerCase().includes('americas') || companyData.class?.name?.toLowerCase().includes('north america') ? 'americas' : 'international';
    
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
    const isAmericas = company.class?.name?.toLowerCase().includes('americas') || company.class?.name?.toLowerCase().includes('north america');
    return isAmericas ? product.price_americas : product.price_international;
  };

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
    const result = Object.entries(categorized)
      .sort(([keyA], [keyB]) => {
        const orderA = parseInt(keyA.split('-')[0]);
        const orderB = parseInt(keyB.split('-')[0]);
        return orderA - orderB;
      })
      .map(([, data]) => data);
    
    
    return result;
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

      {/* Main Layout - Company Info, Products, and Order Summary */}
      {company && products.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-8 gap-6">
          {/* Left Column - Company Info and Products */}
          <div className="xl:col-span-6 space-y-6">
            {/* Company Info */}
            <Card>
              <div className="px-6 py-4">
                <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
              </div>
              <div className="px-6 py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700">Company Name</label>
                    <div className="text-sm text-gray-900">{company.company_name}</div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700">Support Fund</label>
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

            {/* PO Number input for New Orders */}
            {isNewMode && (
              <div className="mb-4">
                <div className="flex items-center space-x-3">
                  <label htmlFor="po-number" className="text-sm font-medium text-gray-700">
                    PO Number:
                  </label>
                  <input
                    type="text"
                    id="po-number"
                    value={(order && order.po_number) || ''}
                    onChange={(e) => setOrder(prev => prev ? { ...prev, po_number: e.target.value } : { id: '', po_number: e.target.value, status: 'Open', company_id: '' })}
                    className="px-3 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Optional"
                  />
                </div>
              </div>
            )}

            {/* Products Table */}
            <div>
            <Card>
              {/* Tab Navigation - Simple tabs with color differentiation */}
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <nav className="flex space-x-8">
                    <button
                      onClick={() => {
                        setShowSupportFundRedemption(false);
                        setExpandedCategories(new Set());
                      }}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        !showSupportFundRedemption
                          ? 'border-gray-900 text-gray-900'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      Order Form
                    </button>
                    <button
                      onClick={() => {
                        setShowSupportFundRedemption(true);
                        setExpandedCategories(new Set());
                      }}
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
              </div>
              <div>
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
                  
                  return categorizedProducts.map((categoryGroup, categoryIndex) => {
                    const categoryId = categoryGroup.category?.id || 0;
                    const isExpanded = expandedCategories.has(categoryId);
                    
                    return (
                      <CategoryAccordion
                        key={categoryGroup.category?.id || 'no-category'}
                        categoryGroup={categoryGroup}
                        categoryId={categoryId}
                        isExpanded={isExpanded}
                        onToggle={() => toggleCategory(categoryId)}
                        showSupportFundRedemption={showSupportFundRedemption}
                        supportFundItems={supportFundItems}
                        orderItems={orderItems}
                        getProductPrice={getProductPrice}
                        handleSupportFundItemChange={handleSupportFundItemChange}
                        handleCaseQtyChange={handleCaseQtyChange}
                        formatCurrency={formatCurrency}
                        highlightedProductId={highlightedProductId}
                      />
                    );
                  });
                })()}
              </div>
            </Card>
            </div>
          </div>

          {/* Order Summary - Takes up 2 columns on xl, full width on smaller screens */}
          <div className="xl:col-span-2 xl:sticky xl:top-32 xl:self-start">
          <Card>
            <div className="px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Order Summary</h3>
            </div>
            <div className="px-3 py-3">
              {/* Order Form Products */}
              {orderItems.length > 0 && (
                <div className="space-y-1">
                  {orderItems.map((item) => (
                    <div key={`order-${item.product_id}`} className="flex items-center justify-between bg-gray-50 p-1 rounded">
                      <div className="flex-1 min-w-0 pr-1">
                        <div 
                          className="text-xs font-medium text-gray-900 truncate leading-tight cursor-pointer hover:text-blue-600 hover:underline"
                          onClick={() => scrollToProduct(item.product_id.toString(), false)}
                          title="Click to locate this product"
                        >
                          {item.product.sku}
                        </div>
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
                <div className="pt-1 border-t">
                  <div className="flex justify-between text-sm font-bold text-gray-900">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(orderItems.reduce((sum, item) => sum + item.total_price, 0))}</span>
                  </div>
                </div>
              )}

              {/* Credit Earned */}
              {orderItems.length > 0 && totals.supportFundEarned > 0 && (
                <div className="pt-1">
                  <div className="flex justify-between text-xs font-medium text-green-600">
                    <span>Credit Earned:</span>
                    <span>{formatCurrency(totals.supportFundEarned)}</span>
                  </div>
                </div>
              )}

              {/* Support Fund Products */}
              {supportFundItems.length > 0 && (
                <div className="space-y-1 pb-2">
                  <div className="text-xs font-bold text-gray-700 uppercase tracking-wide mt-2 pb-1 border-b border-gray-200 mb-2">Support Fund Products</div>
                  {supportFundItems.map((item) => (
                    <div key={`sf-${item.product_id}`} className="flex items-center justify-between bg-green-50 p-1 rounded">
                      <div className="flex-1 min-w-0 pr-1">
                        <div 
                          className="text-xs font-medium text-green-800 truncate leading-tight cursor-pointer hover:text-blue-600 hover:underline"
                          onClick={() => scrollToProduct(item.product_id.toString(), true)}
                          title="Click to locate this product"
                        >
                          {item.product.sku}
                        </div>
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
                <div className="pt-1 border-t border-green-200">
                  <div className="flex justify-between text-xs font-medium text-green-800">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(supportFundItems.reduce((sum, item) => sum + item.total_price, 0))}</span>
                  </div>
                </div>
              )}

              {/* Credit Used */}
              {supportFundItems.length > 0 && (
                <div className="flex justify-between text-xs font-medium pt-1">
                  <span>Credit Used:</span>
                  <span className="text-green-600">
                    {formatCurrency(Math.min(supportFundTotals.subtotal, totals.supportFundEarned))}
                  </span>
                </div>
              )}

              {/* Remaining Credit */}
              {supportFundItems.length > 0 && (
                <div className="pb-2">
                  <div className="pt-1 border-t">
                    <div className="flex justify-between text-xs font-medium text-gray-900">
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
                <div className="pb-2">
                  <div className="text-xs text-gray-500 italic pt-1">
                    <div>* Credit must be redeemed in full with each order</div>
                    <div>* Any unused Support Fund credit will be forfeited</div>
                    <div>* Remaining negative credit adds to total order</div>
                  </div>
                </div>
              )}

              {/* Grand Total */}
              <div className="pt-2 border-t">
                <div className="flex justify-between text-sm font-semibold text-gray-900">
                  <span>Grand Total:</span>
                  <span>{formatCurrency(totals.subtotal + supportFundTotals.finalTotal)}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pb-3 pt-3">
                <div className="flex space-x-3">
                  <button
                    onClick={handleSave}
                    disabled={saving || !company}
                    className="flex-1 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
