'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import ClientLayout from '../../../../components/ClientLayout';
import Link from 'next/link';

interface Order {
  id: string;
  created_at: string;
  status: string;
  total_value: number;
  support_fund_used: number;
  credit_earned: number;
  user_id: string;
  company_id: string;
  po_number: string;
  client?: {
    name: string;
    email: string;
  };
  company?: {
    company_name: string;
    netsuite_number: string;
    ship_to?: string;
    support_fund?: { percent: number };
    subsidiary?: { 
      name: string;
      ship_from_address?: string;
      company_address?: string;
      phone?: string;
      email?: string;
    };
    class?: { name: string };
    location?: { location_name: string };
    incoterm?: { name: string };
    payment_term?: { name: string };
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item?: boolean;
  sort_order?: number;
  product?: {
    item_name: string;
    sku: string;
    price_international: number;
    price_americas: number;
    qualifies_for_credit_earning?: boolean;
    case_pack?: number;
    case_weight?: number;
    hs_code?: string;
    made_in?: string;
  };
}

interface PackingSlip {
  id: string;
  order_id: string;
  invoice_number: string;
  shipping_method: string;
  netsuite_reference?: string;
  notes?: string;
  created_at: string;
  created_by: string;
}

export default function ClientPackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [packingSlip, setPackingSlip] = useState<PackingSlip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isPrintMode, setIsPrintMode] = useState(false);

  useEffect(() => {
    if (orderId) {
      fetchData();
    }
  }, [orderId]);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      const [orderResult, itemsResult, packingSlipResult] = await Promise.all([
        // Fetch order
        supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .eq('user_id', user.id)
          .single(),
        
        // Fetch order items
        supabase
          .from('order_items')
          .select(`
            *,
            product:Products(item_name, sku, price_international, price_americas, qualifies_for_credit_earning, case_pack, case_weight, hs_code, made_in)
          `)
          .eq('order_id', orderId)
          .order('is_support_fund_item', { ascending: true })
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true }),
        
        // Fetch packing slip
        supabase
          .from('packing_slips')
          .select('*')
          .eq('order_id', orderId)
          .single()
      ]);

      if (orderResult.error) throw orderResult.error;
      if (itemsResult.error) throw itemsResult.error;
      if (packingSlipResult.error) throw packingSlipResult.error;

      setOrder(orderResult.data);
      setOrderItems(itemsResult.data || []);
      setPackingSlip(packingSlipResult.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    setIsPrintMode(true);
    window.print();
    setIsPrintMode(false);
  };

  if (loading) {
    return (
      <ClientLayout>
        <div className="p-6">
          <p>Loading packing slip...</p>
        </div>
      </ClientLayout>
    );
  }

  if (error || !order || !packingSlip) {
    return (
      <ClientLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Packing Slip Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The packing slip you are looking for does not exist.'}</p>
            <Link
              href={`/client/orders/${orderId}`}
              className="bg-black text-white px-4 py-2 hover:opacity-90 transition"
            >
              Back to Order
            </Link>
          </div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout>
      <div className="min-h-screen bg-blue-gray-50/50">
        {/* Header - Hidden in print */}
        <div className={`bg-white shadow-sm border-b ${isPrintMode ? 'hidden' : ''}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Packing Slip</h1>
                <p className="text-sm text-gray-600">Invoice #{packingSlip.invoice_number}</p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handlePrint}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Print / Save PDF
                </button>
                <Link
                  href={`/client/orders/${orderId}`}
                  className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  Back to Order
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Packing Slip Content */}
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 pb-6 border-b border-gray-200">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  {order.company?.subsidiary?.name || 'Qiqi Partners'}
                </h1>
                <div className="text-gray-600 text-sm leading-relaxed">
                  {order.company?.subsidiary?.ship_from_address || 'Address not configured'}
                </div>
                {order.company?.subsidiary?.phone && (
                  <div className="text-gray-600 text-sm">Phone: {order.company.subsidiary.phone}</div>
                )}
                {order.company?.subsidiary?.email && (
                  <div className="text-gray-600 text-sm">Email: {order.company.subsidiary.email}</div>
                )}
              </div>
              <div className="text-right">
                <img src="/QIQI-Logo.svg" alt="Qiqi Logo" className="h-16 w-auto" />
              </div>
            </div>

            {/* Packing Slip Title */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900">PACKING SLIP</h2>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8 p-6 bg-gray-50 rounded-lg">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Ship To</h3>
                <div className="text-gray-900">
                  <div className="font-semibold">{order.company?.company_name || 'N/A'}</div>
                  <div className="mt-1 whitespace-pre-line text-sm">
                    {order.company?.ship_to || 'Ship To Address not configured'}
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Order Details</h3>
                <div className="space-y-1 text-sm">
                  <div><span className="font-medium">Date:</span> {new Date().toLocaleDateString()}</div>
                  <div><span className="font-medium">Invoice:</span> {packingSlip.invoice_number}</div>
                  <div><span className="font-medium">Method:</span> {packingSlip.shipping_method}</div>
                  <div><span className="font-medium">Reference:</span> {packingSlip.netsuite_reference || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-8">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">SKU</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wide">Product Name</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Total Units</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Case Pack</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Cases</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wide">Total Weight</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {orderItems.map((item) => {
                    const product = item.product;
                    const casePack = product?.case_pack || 1;
                    const cases = Math.ceil(item.quantity / casePack);
                    const caseWeight = product?.case_weight || 0;
                    const weight = cases * caseWeight;
                    
                    return (
                      <tr key={item.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">{product?.sku || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{product?.item_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{item.quantity}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{casePack}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{cases}</td>
                        <td className="px-4 py-3 text-sm text-gray-900 text-center">{weight.toFixed(2)} kg</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="text-right">
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-900">Total Cases:</span>
                  <span className="font-bold text-gray-900 ml-8">
                    {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      return sum + Math.ceil(item.quantity / casePack);
                    }, 0)}
                  </span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="font-medium text-gray-900">Total Weight:</span>
                  <span className="font-bold text-gray-900 ml-8">
                    {orderItems.reduce((sum, item) => {
                      const casePack = item.product?.case_pack || 1;
                      const cases = Math.ceil(item.quantity / casePack);
                      const caseWeight = item.product?.case_weight || 0;
                      return sum + (cases * caseWeight);
                    }, 0).toFixed(2)} kg
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {packingSlip.notes && (
              <div className="mb-8 p-6 bg-gray-50 rounded-lg">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Notes</h3>
                <p className="text-gray-700 whitespace-pre-line">{packingSlip.notes}</p>
              </div>
            )}

            {/* Signature Section */}
            <div className="flex justify-between mt-12">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 w-48">
                  <div className="text-sm text-gray-600">Shipper Signature</div>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 w-48">
                  <div className="text-sm text-gray-600">Date</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ClientLayout>
  );
}
