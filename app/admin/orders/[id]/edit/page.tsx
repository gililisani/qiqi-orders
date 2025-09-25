'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import AdminLayout from '../../../../components/AdminLayout';
import Card from '../../../../components/ui/Card';
import Link from 'next/link';

interface Product {
  id: number;
  item_name: string;
  sku: string;
  size: string;
  case_pack: number;
  price_international: number;
  price_americas: number;
  qualifies_for_credit_earning: boolean;
  picture_url?: string;
}

interface Company {
  id: string;
  company_name: string;
  class?: { name: string } | null;
  support_fund?: { percent: number }[] | { percent: number } | null;
}

interface OrderItemRow {
  product_id: number;
  product: Product;
  case_qty: number;
  total_units: number;
  unit_price: number;
  total_price: number;
}

interface OrderRecord {
  id: string;
  company_id: string;
  status: string;
  po_number: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
}

export default function AdminEditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;

  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderItems, setOrderItems] = useState<OrderItemRow[]>([]);
  const [poNumber, setPoNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const formatCurrency = (amount: number) => `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const getClientType = () => {
    const cls = company?.class?.name?.toLowerCase() || '';
    return cls.includes('international') ? 'International' : 'Americas';
  };

  const getProductPrice = (p: Product) => getClientType() === 'International' ? p.price_international : p.price_americas;

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  useEffect(() => {
    if (order && company) {
      fetchProducts();
    }
  }, [order, company]);

  const fetchOrder = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData as OrderRecord);
      setPoNumber(orderData.po_number || '');

      if (orderData.company_id) {
        const { data: companyData, error: companyError } = await supabase
          .from('companies')
          .select(`
            id,
            company_name,
            support_fund:support_fund_levels(percent),
            class:classes(name)
          `)
          .eq('id', orderData.company_id)
          .single();
        if (companyError) throw companyError;
        // Normalize payload: sometimes relational selects return arrays
        const normalizedCompany: Company = {
          id: (companyData as any).id,
          company_name: (companyData as any).company_name,
          support_fund: (companyData as any).support_fund,
          class: Array.isArray((companyData as any).class)
            ? ((companyData as any).class[0] || null)
            : ((companyData as any).class || null),
        };
        setCompany(normalizedCompany);
      }

      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select(`*, product:Products(*)`)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('id', { ascending: true });
      if (itemsError) throw itemsError;

      const rows: OrderItemRow[] = (items || []).filter(i => i.product).map(i => {
        const product = i.product as Product;
        const unitPrice = getProductPrice(product);
        const caseQty = Math.ceil((i.quantity || 0) / (product.case_pack || 1));
        const totalUnits = caseQty * (product.case_pack || 1);
        const totalPrice = unitPrice * totalUnits;
        return {
          product_id: product.id,
          product,
          case_qty: caseQty,
          total_units: totalUnits,
          unit_price: unitPrice,
          total_price: totalPrice,
        };
      });
      setOrderItems(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const visibilityColumn = getClientType() === 'International' ? 'visible_to_international' : 'visible_to_americas';
      const { data, error } = await supabase
        .from('Products')
        .select(`*`)
        .eq(visibilityColumn, true)
        .order('item_name');
      if (error) throw error;
      setProducts(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCaseQtyChange = (product: Product, caseQty: number) => {
    const unitPrice = getProductPrice(product);
    const totalUnits = Math.max(0, caseQty) * (product.case_pack || 1);
    const totalPrice = unitPrice * totalUnits;

    setOrderItems(prev => {
      const existingIndex = prev.findIndex(r => r.product_id === product.id);
      if (caseQty <= 0) {
        if (existingIndex >= 0) {
          const clone = [...prev];
          clone.splice(existingIndex, 1);
          return clone;
        }
        return prev;
      }
      const newRow: OrderItemRow = {
        product_id: product.id,
        product,
        case_qty: caseQty,
        total_units: totalUnits,
        unit_price: unitPrice,
        total_price: totalPrice,
      };
      if (existingIndex >= 0) {
        const clone = [...prev];
        clone[existingIndex] = newRow;
        return clone;
      }
      return [...prev, newRow];
    });
  };

  const totals = (() => {
    const subtotal = orderItems.reduce((s, r) => s + r.total_price, 0);
    const rawSf = company?.support_fund as any;
    const supportFundPercent = Array.isArray(rawSf) ? (rawSf[0]?.percent || 0) : (rawSf?.percent || 0);
    const creditEarningItems = orderItems.filter(r => r.product.qualifies_for_credit_earning);
    const creditEarningSubtotal = creditEarningItems.reduce((s, r) => s + r.total_price, 0);
    const supportFundEarned = creditEarningSubtotal * (supportFundPercent / 100);
    return { subtotal, supportFundPercent, supportFundEarned };
  })();

  const handleSave = async () => {
    if (!order) return;
    if (orderItems.length === 0) {
      setError('Please add at least one product.');
      return;
    }
    try {
      setSubmitting(true);
      setError('');

      const supportFundUsed = Math.min(totals.supportFundEarned, orderItems.reduce((s, r) => s + r.total_price, 0));
      const additionalCost = Math.max(0, supportFundUsed - totals.supportFundEarned);
      const finalTotal = totals.subtotal + additionalCost;

      const { error: updateOrderError } = await supabase
        .from('orders')
        .update({
          po_number: poNumber,
          total_value: finalTotal,
          support_fund_used: supportFundUsed,
          credit_earned: totals.supportFundEarned,
        })
        .eq('id', orderId);
      if (updateOrderError) throw updateOrderError;

      const { error: deleteErr } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);
      if (deleteErr) throw deleteErr;

      const itemsPayload = orderItems.map((r, idx) => ({
        order_id: orderId,
        product_id: r.product_id,
        quantity: r.total_units,
        unit_price: r.unit_price,
        total_price: r.total_price,
        is_support_fund_item: false,
        sort_order: idx,
      }));
      if (itemsPayload.length > 0) {
        const { error: insertErr } = await supabase
          .from('order_items')
          .insert(itemsPayload);
        if (insertErr) throw insertErr;
      }

      router.push(`/admin/orders/${orderId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">Loading order...</div>
      </AdminLayout>
    );
  }

  if (error) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-red-600 mb-4">{error}</div>
          <Link href={`/admin/orders/${orderId}`} className="text-blue-600 hover:text-blue-800">← Back to Order</Link>
        </div>
      </AdminLayout>
    );
  }

  if (!order || !company) {
    return (
      <AdminLayout>
        <div className="p-6">Order not found</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 pb-16">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Edit Order</h1>
            <p className="text-gray-600 mt-1">{company.company_name}</p>
          </div>
          <div className="flex items-center space-x-4">
            <button
              onClick={handleSave}
              disabled={submitting || orderItems.length === 0}
              className="bg-green-600 text-white px-6 py-2 hover:bg-green-700 transition disabled:opacity-50"
            >
              {submitting ? 'Updating...' : 'Update Order'}
            </button>
            <Link href={`/admin/orders/${orderId}`} className="text-gray-600 hover:text-gray-800">Cancel</Link>
          </div>
        </div>

        <Card header={<h3 className="font-semibold">Order Details</h3>}>
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 mb-2">PO/Cheque Number</label>
            <input
              type="text"
              value={poNumber}
              onChange={(e) => setPoNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        </Card>

        <Card header={<h3 className="font-semibold">Products</h3>}>
          <div className="overflow-x-auto">
            <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
              <thead>
                <tr className="border-b border-[#e5e5e5]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Product</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Pack</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Price</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Qty (Cases)</th>
                  <th className="px-4 py-3 pr-4 text-center text-xs font-medium text-gray-600 uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const row = orderItems.find(r => r.product_id === p.id);
                  const unitPrice = getProductPrice(p);
                  const total = row ? row.total_price : 0;
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 border-b border-[#e5e5e5]">
                      <td className="px-4 py-3 text-sm text-gray-900">{p.item_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-center">{p.sku}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-center">{p.case_pack}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-center">{formatCurrency(unitPrice)}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="inline-flex items-center border border-gray-300 rounded select-none justify-center">
                          <button type="button" onClick={() => handleCaseQtyChange(p, Math.max(0, (row?.case_qty || 0) - 1))} className="px-2 py-1 text-gray-700 hover:bg-gray-100">−</button>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row?.case_qty ?? 0}
                            onChange={(e) => {
                              const val = e.currentTarget.value.replace(/[^0-9]/g, '');
                              const parsed = val === '' ? 0 : Math.max(0, Math.min(99, Number(val)));
                              handleCaseQtyChange(p, parsed);
                            }}
                            className="w-10 px-1 py-1 text-center text-sm focus:outline-none"
                          />
                          <button type="button" onClick={() => handleCaseQtyChange(p, (row?.case_qty || 0) + 1)} className="px-2 py-1 text-gray-700 hover:bg-gray-100">+</button>
                        </div>
                      </td>
                      <td className="px-4 py-3 pr-4 text-sm font-medium text-gray-900 text-center">{formatCurrency(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AdminLayout>
  );
}


