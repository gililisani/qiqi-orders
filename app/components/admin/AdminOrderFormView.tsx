'use client';

/**
 * AdminOrderFormView — admin-only version of the order create/edit form.
 *
 * Forked from `app/components/shared/OrderFormView.tsx` so the admin side
 * can move to qq primitives without touching the client surface. Reuses the
 * shared `useOrderFormController` hook for state, fetch, save, and totals
 * (the controller doesn't care about role beyond redirect-target + audit
 * tagging — we always pass role="admin").
 *
 * Differences vs the legacy shared file:
 *   - All UI on qq primitives (Card, Tabs, Dialog, Input, Button, Badge)
 *   - Native company picker upgraded to typed-search dropdown (still custom
 *     because we need free-form search across name and netsuite_number)
 *   - Support-fund reminder is a proper qq Dialog
 *   - Confirm-on-back uses native window.confirm for now (matches legacy);
 *     could later be swapped to useConfirm
 */

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ChevronDown, Gift, Minus, Plus, RotateCcw } from 'lucide-react';

import { useSupabase } from '../../../lib/supabase-provider';
import { useOrderFormController } from '../shared/orderForm/useOrderFormController';

import { PageHeader } from '../qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Button } from '../qq/button';
import { Input } from '../qq/input';
import { Label } from '../qq/label';
import { Badge } from '../qq/badge';
import { Separator } from '../qq/separator';
import { Alert, AlertDescription } from '../qq/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../qq/dialog';
import { Tabs, TabsList, TabsTrigger } from '../qq/tabs';

// ---------------- Types ----------------
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
  out_of_stock?: boolean;
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
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface SupportFundItem extends OrderItem {}

interface Order {
  id: string;
  po_number?: string;
  status: string;
  company_id: string;
  company?: Company;
}

interface AdminOrderFormViewProps {
  orderId?: string | null;
  backUrl: string;
}

const formatCurrency = (amount: number) =>
  `$${(amount || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
export default function AdminOrderFormView({ orderId, backUrl }: AdminOrderFormViewProps) {
  const { supabase } = useSupabase();
  const router = useRouter();

  // ---- Core state ----
  const [order, setOrder] = useState<Order | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [supportFundItems, setSupportFundItems] = useState<SupportFundItem[]>([]);
  const [company, setCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSupportFundTab, setShowSupportFundTab] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [showCompanyDropdown, setShowCompanyDropdown] = useState(false);
  const companyDropdownRef = useRef<HTMLDivElement>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);
  const [showSupportFundReminder, setShowSupportFundReminder] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const performSaveInFlightRef = useRef(false);

  // Cart scroll handling
  const cartListRef = useRef<HTMLDivElement>(null);
  const [cartHasMoreBelow, setCartHasMoreBelow] = useState(false);
  const prevOrderLenRef = useRef(0);
  const prevSfLenRef = useRef(0);

  const isEditMode = !!orderId;
  const isNewMode = !orderId;

  // Recalculate the "scroll hint" indicator: true when the cart list has
  // more content below the visible area.
  const recalcCartScrollHint = () => {
    const el = cartListRef.current;
    if (!el) return;
    const hasMore = el.scrollHeight - el.scrollTop - el.clientHeight > 4;
    setCartHasMoreBelow(hasMore);
  };

  // Watch scroll + window resize to toggle the down-arrow hint
  useEffect(() => {
    const el = cartListRef.current;
    if (!el) return;
    recalcCartScrollHint();
    el.addEventListener('scroll', recalcCartScrollHint);
    window.addEventListener('resize', recalcCartScrollHint);
    return () => {
      el.removeEventListener('scroll', recalcCartScrollHint);
      window.removeEventListener('resize', recalcCartScrollHint);
    };
  }, []);

  // Auto-scroll on single user-initiated add (ignores bulk hydration)
  // and recompute the chevron hint on length / tab changes.
  useEffect(() => {
    const currentLen = showSupportFundTab ? supportFundItems.length : orderItems.length;
    const prevLen = showSupportFundTab ? prevSfLenRef.current : prevOrderLenRef.current;
    if (currentLen === prevLen + 1 && cartListRef.current) {
      requestAnimationFrame(() => {
        cartListRef.current?.scrollTo({
          top: cartListRef.current.scrollHeight,
          behavior: 'smooth',
        });
        recalcCartScrollHint();
      });
    } else {
      requestAnimationFrame(recalcCartScrollHint);
    }
    prevOrderLenRef.current = orderItems.length;
    prevSfLenRef.current = supportFundItems.length;
  }, [orderItems.length, supportFundItems.length, showSupportFundTab]);

  // ---- Close dropdown when clicking outside ----
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(e.target as Node)
      ) {
        setShowCompanyDropdown(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ---- Tabs reset accordion ----
  const switchToOrderTab = () => {
    setShowSupportFundTab(false);
    setExpandedCategories(new Set());
  };
  const switchToSupportFundTab = () => {
    setShowSupportFundTab(true);
    setExpandedCategories(new Set());
  };

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories((prev) => {
      const next = new Set<number>();
      if (!prev.has(categoryId)) next.add(categoryId);
      return next;
    });
  };

  // ---- Back with unsaved-changes guard ----
  const handleBack = () => {
    if (
      isNewMode &&
      hasUnsavedChanges &&
      (orderItems.length > 0 || supportFundItems.length > 0)
    ) {
      const ok = window.confirm(
        'Are you sure you want to leave this page? Your unsaved changes will be lost.'
      );
      if (!ok) return;
    }
    router.push(backUrl);
  };

  // ---- Companies fetch (admin: needs the picker) ----
  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select(
          `id, company_name, netsuite_number, location_id, support_fund:support_fund_levels(percent), class:classes(name)`
        )
        .order('company_name', { ascending: true });
      if (error) throw error;
      setCompanies(data || []);
    } catch (err: any) {
      console.error('Failed to fetch companies', err);
    }
  };

  const fetchProductsForCompany = async (companyData: Company) => {
    try {
      const { data, error } = await supabase
        .from('Products')
        .select('*, category:categories(*)')
        .eq('enable', true)
        .order('item_name');
      if (error) throw error;
      setProducts((data || []) as Product[]);
    } catch (err: any) {
      console.error('Failed to fetch products', err);
    }
  };

  const fetchOrder = async () => {
    if (!orderId) return;
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(
          `*, company:companies(*, support_fund:support_fund_levels(percent), class:classes(name))`
        )
        .eq('id', orderId)
        .single();
      if (orderError) throw orderError;
      setOrder(orderData as Order);
      setCompany(orderData.company as Company);
      setSelectedCompanyId(orderData.company_id);

      // Fetch existing items
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*, product:Products(*)')
        .eq('order_id', orderId);
      if (itemsError) throw itemsError;
      const regular = (items || []).filter((i: any) => !i.is_support_fund_item);
      const sf = (items || []).filter((i: any) => i.is_support_fund_item);
      setOrderItems(
        regular.map((i: any) => ({
          product_id: i.product_id,
          product: i.product,
          case_qty: i.case_qty,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
        }))
      );
      setSupportFundItems(
        sf.map((i: any) => ({
          product_id: i.product_id,
          product: i.product,
          case_qty: i.case_qty,
          quantity: i.quantity,
          unit_price: i.unit_price,
          total_price: i.total_price,
        }))
      );

      await fetchProductsForCompany(orderData.company as Company);
    } catch (err: any) {
      setError(err.message || 'Failed to load order.');
    }
  };

  useEffect(() => {
    if (isEditMode) {
      fetchOrder();
    } else {
      fetchCompanies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // ---- Admin chose a company ----
  const handleCompanyPick = async (companyId: string) => {
    const c = companies.find((x) => x.id === companyId) || null;
    setCompany(c);
    setSelectedCompanyId(companyId);
    setOrder({ id: '', po_number: '', status: 'Open', company_id: companyId });
    if (c) {
      await fetchProductsForCompany(c);
    }
  };

  // ---- Pricing helpers ----
  // Pick the correct price column based on the company's NetSuite class.
  // Class names in NS are things like "North America Distributors" or
  // "International Distributors"; we test by substring so we don't depend
  // on exact wording. Any class whose name mentions "america" maps to
  // price_americas; everything else (including no class at all) falls
  // back to price_international, matching the historical default.
  const getProductPrice = (product: Product) => {
    const className = (company?.class?.name || '').toLowerCase();
    if (className.includes('america')) return product.price_americas || 0;
    return product.price_international || 0;
  };

  // ---- Group products by category ----
  const getProductsByCategory = () => {
    const grouped: { category: Category | null; products: Product[] }[] = [];
    const map = new Map<number | string, { category: Category | null; products: Product[] }>();
    for (const p of products) {
      const key = p.category?.id ?? 'no-category';
      if (!map.has(key)) {
        map.set(key, { category: p.category ?? null, products: [] });
      }
      map.get(key)!.products.push(p);
    }
    // Sort by category sort_order (no-category last)
    return Array.from(map.values()).sort((a, b) => {
      const aOrder = a.category?.sort_order ?? 9999;
      const bOrder = b.category?.sort_order ?? 9999;
      return aOrder - bOrder;
    });
  };

  // ---- Mutators ----
  const handleCaseQtyChange = (productId: number, newCaseQty: number) => {
    setHasUnsavedChanges(true);
    setOrderItems((prev) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return prev;
      const unitPrice = getProductPrice(product);
      const quantity = newCaseQty * (product.case_pack || 1);
      const totalPrice = quantity * unitPrice;
      const existing = prev.find((i) => i.product_id === productId);

      if (newCaseQty === 0) {
        return prev.filter((i) => i.product_id !== productId);
      }
      if (existing) {
        return prev.map((i) =>
          i.product_id === productId
            ? { ...i, case_qty: newCaseQty, quantity, unit_price: unitPrice, total_price: totalPrice }
            : i
        );
      }
      return [
        ...prev,
        {
          product_id: productId,
          product,
          case_qty: newCaseQty,
          quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
        },
      ];
    });
  };

  const handleSupportFundItemChange = (productId: number, newCaseQty: number) => {
    setHasUnsavedChanges(true);
    setSupportFundItems((prev) => {
      const product = products.find((p) => p.id === productId);
      if (!product) return prev;
      const unitPrice = getProductPrice(product);
      const quantity = newCaseQty * (product.case_pack || 1);
      const totalPrice = quantity * unitPrice;
      const existing = prev.find((i) => i.product_id === productId);
      if (newCaseQty === 0) {
        return prev.filter((i) => i.product_id !== productId);
      }
      if (existing) {
        return prev.map((i) =>
          i.product_id === productId
            ? { ...i, case_qty: newCaseQty, quantity, unit_price: unitPrice, total_price: totalPrice }
            : i
        );
      }
      return [
        ...prev,
        {
          product_id: productId,
          product,
          case_qty: newCaseQty,
          quantity,
          unit_price: unitPrice,
          total_price: totalPrice,
        },
      ];
    });
  };

  // ---- Totals (local; same shape the controller expects via getter fns) ----
  const supportFundPercent = (() => {
    const rawSf = company?.support_fund as any;
    if (Array.isArray(rawSf)) return rawSf[0]?.percent || 0;
    return rawSf?.percent || 0;
  })();

  const getOrderTotals = () => {
    const subtotal = orderItems.reduce((s, i) => s + i.total_price, 0);
    const creditEarningItems = orderItems.filter((i) => i.product.qualifies_for_credit_earning);
    const creditEarningSubtotal = creditEarningItems.reduce((s, i) => s + i.total_price, 0);
    const supportFundEarned = creditEarningSubtotal * (supportFundPercent / 100);
    return { subtotal, supportFundPercent, supportFundEarned, total: subtotal };
  };

  const getSupportFundTotals = () => {
    const subtotal = supportFundItems.reduce((s, i) => s + i.total_price, 0);
    const supportFundEarned = getOrderTotals().supportFundEarned;
    const remainingCredit = supportFundEarned - subtotal;
    const finalTotal = remainingCredit < 0 ? Math.abs(remainingCredit) : 0;
    return {
      subtotal,
      supportFundEarned,
      remainingCredit,
      finalTotal,
      itemCount: supportFundItems.length,
    };
  };

  const totals = getOrderTotals();
  const supportFundTotals = getSupportFundTotals();

  const { performSave, handleSave, handleSaveAsDraft } = useOrderFormController({
    supabase,
    router,
    role: 'admin',
    orderId,
    isNewMode,
    order,
    company,
    orderItems,
    supportFundItems,
    saving,
    performSaveInFlightRef,
    setSaving,
    setError,
    setHasUnsavedChanges,
    setShowSupportFundReminder,
    getOrderTotals,
    getSupportFundTotals,
  });

  const proceedWithoutSupportFunds = async () => {
    setShowSupportFundReminder(false);
    await performSave(false);
  };

  const goBackToSupportFunds = () => {
    setShowSupportFundReminder(false);
    setShowSupportFundTab(true);
  };

  // ---- Scroll-to-product (when clicking line item in summary) ----
  const scrollToProduct = (productId: string, isSupportFundProduct = false) => {
    if (isSupportFundProduct !== showSupportFundTab) {
      setShowSupportFundTab(isSupportFundProduct);
    }
    setHighlightedProductId(productId);
    const groups = getProductsByCategory();
    for (const g of groups) {
      const p = g.products.find((x) => x.id === parseInt(productId));
      if (p) {
        const catId = g.category?.id ?? 0;
        setExpandedCategories(new Set([catId]));
        setTimeout(() => {
          document
            .getElementById(`accordion-${catId}`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
        setTimeout(() => setHighlightedProductId(null), 3000);
        break;
      }
    }
  };

  // ---- Display ----
  const filteredCompanies = companies.filter(
    (c) =>
      c.company_name.toLowerCase().includes(companySearch.toLowerCase()) ||
      c.netsuite_number?.toLowerCase().includes(companySearch.toLowerCase())
  );

  const productsForView = (() => {
    const groups = getProductsByCategory();
    return showSupportFundTab
      ? groups
          .map((g) => ({ ...g, products: g.products.filter((p) => p.list_in_support_funds) }))
          .filter((g) => g.products.length > 0)
      : groups;
  })();

  const orderGrandTotal = totals.subtotal + supportFundTotals.finalTotal;

  return (
    <div className="px-6 py-8 space-y-6">
      <PageHeader
        title={isNewMode ? 'New order' : `Edit order${order?.po_number ? ` · ${order.po_number}` : ''}`}
        description={
          company
            ? `${company.company_name}${company.netsuite_number ? ` · NS ${company.netsuite_number}` : ''}`
            : isNewMode
              ? 'Pick a company to start.'
              : undefined
        }
        actions={
          <Button variant="outline" size="sm" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Company picker (admin, new only, before pick) */}
      {isNewMode && !company && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Select customer</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={companyDropdownRef} className="max-w-md relative">
              <Label className="text-sm font-medium">Company</Label>
              <div className="mt-1.5">
                <Input
                  value={companySearch}
                  onChange={(e) => {
                    setCompanySearch(e.target.value);
                    setShowCompanyDropdown(true);
                  }}
                  onFocus={() => setShowCompanyDropdown(true)}
                  placeholder="Search by name or NetSuite number…"
                />
              </div>
              {showCompanyDropdown && (
                <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border border-border bg-background rounded-md shadow-md">
                  {filteredCompanies.length === 0 ? (
                    <li className="px-3 py-2 text-sm text-muted-foreground">No companies found.</li>
                  ) : (
                    filteredCompanies.map((c) => (
                      <li
                        key={c.id}
                        onClick={() => {
                          setCompanySearch(c.company_name);
                          setShowCompanyDropdown(false);
                          handleCompanyPick(c.id);
                        }}
                        className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                      >
                        <div className="font-medium">{c.company_name}</div>
                        {c.netsuite_number && (
                          <div className="text-xs text-muted-foreground font-mono">
                            NS {c.netsuite_number}
                          </div>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main layout */}
      {company && products.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-8 gap-6">
          {/* Left column */}
          <div className="xl:col-span-6 space-y-6">
            {/* Company info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Company information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5">Company</p>
                    <p className="font-medium">{company.company_name}</p>
                  </div>
                  {company.netsuite_number && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">NetSuite number</p>
                      <p className="font-mono text-xs">{company.netsuite_number}</p>
                    </div>
                  )}
                  {supportFundPercent > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Support fund</p>
                      <Badge variant="success">{supportFundPercent}% credit</Badge>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* PO Number (new mode) */}
            {isNewMode && (
              <div className="flex items-center gap-3">
                <Label htmlFor="po-number" className="text-sm font-medium shrink-0">
                  PO number
                </Label>
                <Input
                  id="po-number"
                  value={order?.po_number || ''}
                  onChange={(e) =>
                    setOrder((prev) =>
                      prev
                        ? { ...prev, po_number: e.target.value }
                        : {
                            id: '',
                            po_number: e.target.value,
                            status: 'Open',
                            company_id: selectedCompanyId,
                          }
                    )
                  }
                  className="max-w-xs"
                  placeholder="Optional"
                />
              </div>
            )}

            {/* Tabs + products */}
            <Card
              className={
                showSupportFundTab
                  ? 'ring-1 ring-green-400/40 bg-green-50/30 transition-colors'
                  : ''
              }
            >
              <CardHeader className="pb-0">
                <Tabs
                  value={showSupportFundTab ? 'support' : 'order'}
                  onValueChange={(v) =>
                    v === 'support' ? switchToSupportFundTab() : switchToOrderTab()
                  }
                >
                  <TabsList>
                    <TabsTrigger value="order">Order form</TabsTrigger>
                    {supportFundPercent > 0 && (
                      <TabsTrigger
                        value="support"
                        className="data-[state=active]:bg-green-100 data-[state=active]:text-green-900 data-[state=active]:border data-[state=active]:border-green-300 data-[state=active]:shadow-sm"
                      >
                        <Gift className="h-3.5 w-3.5 mr-1.5" />
                        Support funds
                        <Badge
                          variant="success"
                          className="ml-2 text-[10px] tabular-nums"
                        >
                          {formatCurrency(totals.supportFundEarned)} available
                        </Badge>
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {productsForView.map((group) => {
                    const catId = group.category?.id ?? 0;
                    const isExpanded = expandedCategories.has(catId);
                    return (
                      <CategoryAccordion
                        key={catId}
                        categoryGroup={group}
                        categoryId={catId}
                        isExpanded={isExpanded}
                        onToggle={() => toggleCategory(catId)}
                        showSupportFundRedemption={showSupportFundTab}
                        supportFundItems={supportFundItems}
                        orderItems={orderItems}
                        getProductPrice={getProductPrice}
                        handleSupportFundItemChange={handleSupportFundItemChange}
                        handleCaseQtyChange={handleCaseQtyChange}
                        highlightedProductId={highlightedProductId}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column: cart
             * top-24 (6rem / 96px) for the topbar; bottom buffer of 6rem
             * (96px) keeps the entire card visible (rounded bottom corners
             * included) on browsers that include chrome (bookmarks, mobile
             * URL bar) or slim taskbars. Total subtracted: 12rem. */}
          <div className="xl:col-span-2 xl:sticky xl:top-24 xl:self-start xl:h-[calc(100vh-12rem)]">
            <Card className="overflow-hidden xl:h-full xl:flex xl:flex-col">
              {/* Header: title + reset */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h3 className="text-sm font-semibold">Order summary</h3>
                {(orderItems.length > 0 || supportFundItems.length > 0) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOrderItems([]);
                      setSupportFundItems([]);
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2 text-xs"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </Button>
                )}
              </div>

              {/* Always-visible summary strip */}
              <div className="px-4 py-3 bg-muted/40 border-b border-border text-xs space-y-1.5 shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Order items</span>
                  <span className="font-mono tabular-nums">
                    {orderItems.length} item{orderItems.length === 1 ? '' : 's'} ·{' '}
                    <span className="font-medium text-foreground">
                      {formatCurrency(orderItems.reduce((s, i) => s + i.total_price, 0))}
                    </span>
                  </span>
                </div>
                {supportFundPercent > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-green-700 flex items-center gap-1">
                      <Gift className="h-3 w-3" /> Support funds
                    </span>
                    <span className="font-mono tabular-nums">
                      {supportFundItems.length} item{supportFundItems.length === 1 ? '' : 's'} ·{' '}
                      <span className="font-medium text-green-800">
                        {formatCurrency(supportFundTotals.subtotal)}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              {/* Cart tabs (synced with main page tabs) */}
              {supportFundPercent > 0 && (
                <div className="px-2 pt-2 border-b border-border bg-background shrink-0">
                  <Tabs
                    value={showSupportFundTab ? 'support' : 'order'}
                    onValueChange={(v) =>
                      v === 'support' ? switchToSupportFundTab() : switchToOrderTab()
                    }
                  >
                    <TabsList className="w-full">
                      <TabsTrigger value="order" className="flex-1 text-xs">
                        Order ({orderItems.length})
                      </TabsTrigger>
                      <TabsTrigger
                        value="support"
                        className="flex-1 text-xs data-[state=active]:bg-green-100 data-[state=active]:text-green-900 data-[state=active]:border data-[state=active]:border-green-300"
                      >
                        <Gift className="h-3 w-3 mr-1" />
                        Support ({supportFundItems.length})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {/* Scrollable item list (per active tab) */}
              <div className="relative xl:flex-1 xl:min-h-0">
                <div
                  ref={cartListRef}
                  className="max-h-[40vh] xl:max-h-none xl:h-full overflow-y-auto px-3 pt-3 pb-6"
                >
                {!showSupportFundTab ? (
                  // ----- Order items tab -----
                  orderItems.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      No items yet. Pick products from the catalog on the left.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {orderItems.map((item) => (
                        <SummaryLine
                          key={`order-${item.product_id}`}
                          sku={item.product.sku}
                          detail={`${item.quantity} units · ${item.case_qty} case${item.case_qty !== 1 ? 's' : ''}`}
                          total={item.total_price}
                          onClick={() => scrollToProduct(item.product_id.toString(), false)}
                        />
                      ))}
                    </div>
                  )
                ) : // ----- Support funds tab -----
                supportFundItems.length === 0 ? (
                  <div className="py-6 text-center text-xs text-muted-foreground space-y-2">
                    <p>No support fund items yet.</p>
                    {totals.supportFundEarned > 0 ? (
                      <p>
                        You've earned{' '}
                        <span className="font-medium text-green-700">
                          {formatCurrency(totals.supportFundEarned)}
                        </span>{' '}
                        in credit. Pick eligible products above to redeem.
                      </p>
                    ) : (
                      <p>Add credit-earning products to the order first.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {supportFundItems.map((item) => (
                      <SummaryLine
                        key={`sf-${item.product_id}`}
                        sku={item.product.sku}
                        detail={`${item.quantity} units · ${item.case_qty} case${item.case_qty !== 1 ? 's' : ''}`}
                        total={item.total_price}
                        accent="success"
                        onClick={() => scrollToProduct(item.product_id.toString(), true)}
                      />
                    ))}
                  </div>
                )}
                </div>
                {/* Scroll-down hint — appears when there's more content below */}
                {cartHasMoreBelow && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background via-background/80 to-transparent flex items-end justify-center pb-1"
                  >
                    <ChevronDown className="h-4 w-4 text-muted-foreground animate-bounce" />
                  </div>
                )}
              </div>

              {/* Sticky bottom: totals + actions */}
              <div className="border-t border-border bg-background px-4 py-3 space-y-3 shrink-0">
                {/* Per-tab subtotal block */}
                {!showSupportFundTab && orderItems.length > 0 && (
                  <div className="space-y-1 text-xs">
                    <Row
                      label="Subtotal"
                      value={formatCurrency(orderItems.reduce((s, i) => s + i.total_price, 0))}
                      small
                    />
                    {totals.supportFundEarned > 0 && (
                      <Row
                        label="Credit earned"
                        value={formatCurrency(totals.supportFundEarned)}
                        small
                        valueClass="text-green-700"
                      />
                    )}
                  </div>
                )}

                {showSupportFundTab && supportFundItems.length > 0 && (
                  <div className="space-y-1 text-xs">
                    <Row
                      label="Subtotal"
                      value={formatCurrency(supportFundTotals.subtotal)}
                      small
                      valueClass="text-green-700"
                    />
                    <Row
                      label="Credit used"
                      value={formatCurrency(
                        Math.min(supportFundTotals.subtotal, totals.supportFundEarned)
                      )}
                      small
                      valueClass="text-green-700"
                    />
                    <Row
                      label="Remaining credit"
                      value={formatCurrency(supportFundTotals.remainingCredit)}
                      small
                      valueClass={
                        supportFundTotals.remainingCredit >= 0
                          ? 'text-green-700'
                          : 'text-destructive'
                      }
                    />
                  </div>
                )}

                {/* Grand total (always visible) */}
                <div className="pt-2 border-t border-border">
                  <Row
                    label="Grand total"
                    value={formatCurrency(orderGrandTotal)}
                    bold
                    labelClass="text-sm font-semibold"
                    valueClass="text-sm font-semibold"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground pt-1">
                    <span>
                      {orderItems.reduce((s, i) => s + (i.quantity || 0), 0) +
                        supportFundItems.reduce((s, i) => s + (i.quantity || 0), 0)}{' '}
                      units ·{' '}
                      {orderItems.reduce((s, i) => s + (i.case_qty || 0), 0) +
                        supportFundItems.reduce((s, i) => s + (i.case_qty || 0), 0)}{' '}
                      cases
                    </span>
                  </div>
                </div>

                {/* Support fund disclaimer (only on support tab with items) */}
                {showSupportFundTab && supportFundItems.length > 0 && (
                  <p className="text-[10px] text-muted-foreground italic leading-tight">
                    Credit must be redeemed in full per order. Unused credit is forfeited.
                    Negative remaining credit adds to total.
                  </p>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  <Button
                    onClick={handleSave}
                    loading={saving}
                    disabled={!company || (orderItems.length === 0 && supportFundItems.length === 0)}
                    className="w-full"
                  >
                    {isNewMode
                      ? 'Create order'
                      : order?.status === 'Draft'
                        ? 'Save as Open'
                        : 'Save changes'}
                  </Button>
                  {(isNewMode || order?.status === 'Draft') && (
                    <Button
                      variant="outline"
                      onClick={handleSaveAsDraft}
                      disabled={saving || !company}
                      className="w-full"
                    >
                      Save as draft
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Support-fund reminder dialog */}
      <Dialog open={showSupportFundReminder} onOpenChange={setShowSupportFundReminder}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Don't forget your support funds</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            You've earned{' '}
            <span className="font-medium text-foreground">
              {formatCurrency(totals.supportFundEarned)}
            </span>{' '}
            in support funds for this order. If you continue, any unused credit will be lost.{' '}
            <span className="font-medium text-foreground">Proceed without redeeming?</span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={goBackToSupportFunds}>
              Go back
            </Button>
            <Button onClick={proceedWithoutSupportFunds}>Proceed</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ----------------------------------------------------------------------------
// CategoryAccordion — single category with collapsible product table
// ----------------------------------------------------------------------------
interface CategoryAccordionProps {
  categoryGroup: { category: Category | null; products: Product[] };
  categoryId: number;
  isExpanded: boolean;
  onToggle: () => void;
  showSupportFundRedemption: boolean;
  supportFundItems: SupportFundItem[];
  orderItems: OrderItem[];
  getProductPrice: (product: Product) => number;
  handleSupportFundItemChange: (productId: number, qty: number) => void;
  handleCaseQtyChange: (productId: number, qty: number) => void;
  highlightedProductId: string | null;
}

function CategoryAccordion({
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
  highlightedProductId,
}: CategoryAccordionProps) {
  return (
    <div id={`accordion-${categoryId}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-4 px-6 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          {categoryGroup.category?.image_url && categoryGroup.category.image_url !== 'null' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={categoryGroup.category.image_url}
              alt={categoryGroup.category.name}
              className="h-6 w-auto object-contain"
            />
          ) : (
            <span className="text-sm font-medium">
              {categoryGroup.category?.name || 'No category'}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {showSupportFundRedemption
              ? `(${categoryGroup.products.length} to redeem)`
              : `(${categoryGroup.products.length} products)`}
          </span>
        </div>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-[5000px]' : 'max-h-0'
        }`}
      >
        <div className="pb-4">
          <table className="w-full" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="bg-muted/40 border-y border-border">
                <th
                  className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ width: '46%' }}
                >
                  Product
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell"
                  style={{ width: '10%' }}
                >
                  SKU
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden xl:table-cell"
                  style={{ width: '7%' }}
                >
                  Size
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden xl:table-cell"
                  style={{ width: '7%' }}
                >
                  Pack
                </th>
                <th
                  className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ width: '12%' }}
                >
                  Price
                </th>
                <th
                  className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ width: '14%' }}
                >
                  Qty
                </th>
                <th
                  className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hidden sm:table-cell"
                  style={{ width: '8%' }}
                >
                  Units
                </th>
                <th
                  className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ width: '12%' }}
                >
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {categoryGroup.products.map((product) => {
                const orderItem = showSupportFundRedemption
                  ? supportFundItems.find((i) => i.product_id === product.id)
                  : orderItems.find((i) => i.product_id === product.id);
                const unitPrice = getProductPrice(product);
                const isHighlighted = highlightedProductId === product.id.toString();
                const hasQty = (orderItem?.case_qty || 0) > 0;

                const baseRowBg = showSupportFundRedemption
                  ? hasQty
                    ? 'bg-green-100/60'
                    : 'bg-green-50/50 hover:bg-green-100/40'
                  : hasQty
                    ? 'bg-muted/30'
                    : 'hover:bg-muted/20';
                return (
                  <tr
                    key={product.id}
                    className={`border-b border-border last:border-b-0 transition-colors ${baseRowBg} ${
                      isHighlighted ? 'ring-2 ring-brand-periwinkle/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-8 w-8 shrink-0 rounded border border-border bg-background overflow-hidden">
                          {product.picture_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={product.picture_url}
                              alt={product.item_name}
                              className="h-full w-full object-cover"
                            />
                          ) : null}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-xs sm:text-sm font-medium truncate"
                            title={product.item_name}
                          >
                            {product.item_name}
                          </div>
                          <div className="flex items-center gap-1 mt-0.5">
                            {product.out_of_stock && (
                              <Badge variant="destructive" className="text-[9px] py-0">
                                Out of stock
                              </Badge>
                            )}
                            {!product.qualifies_for_credit_earning && (
                              <Badge variant="muted" className="text-[9px] py-0">
                                No credit
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs font-mono text-muted-foreground hidden sm:table-cell">
                      {product.sku}
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs text-muted-foreground hidden xl:table-cell">
                      {product.size}
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs text-muted-foreground hidden xl:table-cell">
                      {product.case_pack}
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs font-mono">
                      {formatCurrency(unitPrice)}
                    </td>
                    <td className="px-1 py-2.5">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const current = orderItem?.case_qty || 0;
                            const next = Math.max(0, current - 1);
                            showSupportFundRedemption
                              ? handleSupportFundItemChange(product.id, next)
                              : handleCaseQtyChange(product.id, next);
                          }}
                          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border hover:bg-muted transition-colors"
                          aria-label="Decrease quantity"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <input
                          type="text"
                          value={orderItem?.case_qty || 0}
                          onChange={(e) => {
                            const next = Math.max(0, parseInt(e.target.value) || 0);
                            showSupportFundRedemption
                              ? handleSupportFundItemChange(product.id, next)
                              : handleCaseQtyChange(product.id, next);
                          }}
                          className="h-6 w-10 text-center text-xs font-medium border border-input rounded focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const current = orderItem?.case_qty || 0;
                            showSupportFundRedemption
                              ? handleSupportFundItemChange(product.id, current + 1)
                              : handleCaseQtyChange(product.id, current + 1);
                          }}
                          className="h-6 w-6 inline-flex items-center justify-center rounded border border-border hover:bg-muted transition-colors"
                          aria-label="Increase quantity"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-xs text-muted-foreground hidden sm:table-cell">
                      {orderItem ? orderItem.quantity : 0}
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs font-mono font-medium">
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
  );
}

// ----------------------------------------------------------------------------
// Small reusable helpers (private to this file)
// ----------------------------------------------------------------------------
function Row({
  label,
  value,
  bold = false,
  small = false,
  labelClass = '',
  valueClass = '',
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  small?: boolean;
  labelClass?: string;
  valueClass?: string;
}) {
  const base = small ? 'text-xs' : 'text-sm';
  return (
    <div className={`flex justify-between ${base}`}>
      <span className={`${bold ? 'font-medium' : ''} ${labelClass}`}>{label}</span>
      <span className={`font-mono ${bold ? 'font-medium' : ''} ${valueClass}`}>{value}</span>
    </div>
  );
}

function SummaryLine({
  sku,
  detail,
  total,
  accent,
  onClick,
}: {
  sku: string;
  detail: string;
  total: number;
  accent?: 'success';
  onClick?: () => void;
}) {
  const isAccent = accent === 'success';
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 ${
        isAccent ? 'bg-green-50' : 'bg-muted/50'
      }`}
    >
      <div className="flex-1 min-w-0 pr-2">
        <button
          type="button"
          onClick={onClick}
          className={`block text-xs font-medium truncate text-left hover:underline ${
            isAccent ? 'text-green-800' : ''
          }`}
          title="Locate this product"
        >
          {sku}
        </button>
        <div
          className={`text-[11px] leading-tight ${
            isAccent ? 'text-green-700' : 'text-muted-foreground'
          }`}
        >
          {detail}
        </div>
      </div>
      <div className={`text-xs font-medium font-mono ${isAccent ? 'text-green-800' : ''}`}>
        {formatCurrency(total)}
      </div>
    </div>
  );
}
