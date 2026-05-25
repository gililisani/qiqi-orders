'use client';

/**
 * AdminOrderDetailsView — admin-only order detail page.
 *
 * Forked from app/components/shared/OrderDetailsView (which still serves
 * /client/orders/[id]). Result: 1,432-LOC mega-file with 40 role branches
 * is now an admin-only view of ~800 LOC with zero role checks.
 *
 * Architectural cleanup:
 *  - Zero role branching (this file is admin-only).
 *  - Action buttons rationalized: ONE contextual primary action +
 *    secondary actions in a dropdown menu instead of 10 inline buttons.
 *  - All visuals via qq primitives.
 *  - Native `<div className="fixed inset-0 ...">` modals replaced with
 *    qq Dialog (Radix-based, accessible, keyboard-friendly).
 *  - alert() / native confirm() → qq toast / useConfirm.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  Edit,
  Mail,
  MoreHorizontal,
  Package,
  FileText,
  FileDown,
  Truck,
  Trash2,
} from 'lucide-react';

import { supabase } from '../../../lib/supabaseClient';
import { useSupabase } from '../../../lib/supabase-provider';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';
import { formatCurrency, formatQuantity } from '../../../lib/formatters';

import { PageHeader } from '../qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../qq/card';
import { Button } from '../qq/button';
import { Input } from '../qq/input';
import { Label } from '../qq/label';
import { FormField } from '../qq/form-field';
import { Alert, AlertDescription } from '../qq/alert';
import { StatusBadge } from '../qq/status-badge';
import { Badge } from '../qq/badge';
import { Separator } from '../qq/separator';
import { EmptyState } from '../qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../qq/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../qq/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../qq/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../qq/select';

import OrderDocumentUpload from '../shared/OrderDocumentUpload';
import AdminOrderDocumentsView from './AdminOrderDocumentsView';
import AdminOrderHistoryView from './AdminOrderHistoryView';
import CreateSLIModal from '../modals/CreateSLIModal';

import { useToast } from '../ui/ToastProvider';
import { useConfirm } from '../ui/ConfirmProvider';
import { salesOrderUrl, invoiceUrl } from '../../../lib/netsuiteUrls';
import { validateRequiredFieldsForStatus } from '../shared/orderDetails/orderDetailsUtils';
import { useOrderDetailsController } from '../shared/orderDetails/useOrderDetailsController';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------
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
  invoice_number?: string | null;
  so_number?: string | null;
  number_of_pallets?: number | null;
  packing_slip_generated?: boolean;
  netsuite_so_id?: string | null;
  netsuite_invoice_id?: string | null;
  company?: {
    company_name: string;
    netsuite_number: string;
    ship_to?: string;
    incoterm?: { name: string };
    payment_term?: { name: string };
  };
}

interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  case_qty?: number;
  unit_price: number;
  total_price: number;
  is_support_fund_item?: boolean;
  sort_order?: number;
  product?: { item_name: string; sku: string };
}

interface AdminOrderDetailsViewProps {
  orderId: string;
  backUrl: string;
  editUrl: string;
  packingSlipUrl: string;
}

const STATUS_OPTIONS = ['Open', 'In Process', 'Ready', 'Done', 'Cancelled'] as const;

// ============================================================================
// Component
// ============================================================================
export default function AdminOrderDetailsView({
  orderId,
  backUrl,
  editUrl,
  packingSlipUrl,
}: AdminOrderDetailsViewProps) {
  const { supabase: scopedSupabase } = useSupabase();
  const toast = useToast();
  const confirm = useConfirm();

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [creatorName, setCreatorName] = useState<string>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [showPackingSlipForm, setShowPackingSlipForm] = useState(false);
  const [packingSlipData, setPackingSlipData] = useState({
    invoice_number: '',
    shipping_method: '',
    netsuite_reference: '',
    notes: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    vat_number: '',
  });

  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [customEmailMessage, setCustomEmailMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingAdminFields, setSavingAdminFields] = useState(false);

  const [adminInvoiceNumber, setAdminInvoiceNumber] = useState('');
  const [adminSoNumber, setAdminSoNumber] = useState('');
  const [adminNumberOfPallets, setAdminNumberOfPallets] = useState('');
  const [editOrderInfoMode, setEditOrderInfoMode] = useState(false);
  const [originalStatus, setOriginalStatus] = useState('');

  const [showSLIModal, setShowSLIModal] = useState(false);
  const [sliData, setSliData] = useState<any>(null);
  const [sliLoading, setSliLoading] = useState(false);

  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [isReordering, setIsReordering] = useState(false);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);

  const validateRequiredFields = (status: string) =>
    validateRequiredFieldsForStatus({
      status,
      adminSoNumber,
      adminInvoiceNumber,
      adminNumberOfPallets,
    });

  // --------------------------------------------------------------------------
  // Data fetching (admin-only, no role branching)
  // --------------------------------------------------------------------------
  const fetchOrder = useCallback(async () => {
    try {
      const { data: orderData, error: orderError } = await scopedSupabase
        .from('orders')
        .select(
          '*, packing_slip_generated, packing_slip_generated_at, packing_slip_generated_by, invoice_number, so_number, netsuite_so_id, netsuite_invoice_id'
        )
        .eq('id', orderId)
        .single();
      if (orderError) throw orderError;

      // Resolve company in a follow-up query (broader select)
      let companyData: Order['company'] | undefined;
      if (orderData.company_id) {
        const { data: c } = await scopedSupabase
          .from('companies')
          .select(
            'company_name, netsuite_number, ship_to, incoterm:incoterms(name), payment_term:payment_terms(name)'
          )
          .eq('id', orderData.company_id)
          .maybeSingle();
        if (c) companyData = c as any;
      }

      const merged: Order = { ...orderData, company: companyData };
      setOrder(merged);
      setOriginalStatus(merged.status || '');
      setAdminInvoiceNumber(merged.invoice_number || '');
      setAdminSoNumber(merged.so_number || '');
      setAdminNumberOfPallets(merged.number_of_pallets?.toString() || '');
    } catch (err: any) {
      console.error('Error fetching order:', err);
      setError(err.message || 'Failed to load order.');
    } finally {
      setLoading(false);
    }
  }, [orderId, scopedSupabase]);

  const fetchOrderItems = useCallback(async () => {
    try {
      const { data, error: itemsError } = await scopedSupabase
        .from('order_items')
        .select(
          'id, order_id, product_id, quantity, case_qty, unit_price, total_price, is_support_fund_item, sort_order, product:Products(item_name, sku)'
        )
        .eq('order_id', orderId)
        .order('sort_order', { ascending: true });
      if (itemsError) throw itemsError;
      setOrderItems((data as unknown as OrderItem[]) || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
    }
  }, [orderId, scopedSupabase]);

  const fetchOrderHistory = useCallback(async () => {
    // History is rendered by OrderHistoryView which fetches its own data
  }, []);

  const fetchSLI = useCallback(async () => {
    setSliLoading(true);
    try {
      const { data: { session } } = await scopedSupabase.auth.getSession();
      if (!session) return;
      const res = await fetchWithAuth(`/api/orders/${orderId}/sli`);
      if (res.ok) {
        const data = await res.json();
        setSliData(data?.sli || null);
      }
    } finally {
      setSliLoading(false);
    }
  }, [orderId, scopedSupabase]);

  useEffect(() => {
    if (!orderId) return;
    fetchOrder();
    fetchOrderItems();
    fetchSLI();
  }, [orderId, fetchOrder, fetchOrderItems, fetchSLI]);

  // Resolve creator name
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!order?.user_id) {
        if (!cancelled) setCreatorName('');
        return;
      }
      const { data: clientRow } = await scopedSupabase
        .from('clients')
        .select('name')
        .eq('id', order.user_id)
        .maybeSingle();
      if (!cancelled) setCreatorName(clientRow?.name || 'Qiqi');
    })();
    return () => {
      cancelled = true;
    };
  }, [order?.user_id, scopedSupabase]);

  // --------------------------------------------------------------------------
  // Controller hook — shared business logic
  // --------------------------------------------------------------------------
  const {
    handleCreatePackingSlip,
    handleSaveAdminOrderRefs,
    handleReorderProducts,
    moveItem,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleStatusChange,
    handleSendCustomEmail,
    handleDownloadCSV,
    handleDownload3PLXLSX,
    handleDeleteOrder,
  } = useOrderDetailsController({
    supabase: scopedSupabase,
    role: 'admin',
    orderId,
    backUrl,
    order,
    orderItems,
    originalStatus,
    editOrderInfoMode,
    draggedItem,
    packingSlipData,
    customEmailMessage,
    adminInvoiceNumber,
    adminSoNumber,
    adminNumberOfPallets,
    setOrder,
    setOrderItems,
    setOriginalStatus,
    setError,
    setSaving,
    setSavingAdminFields,
    setEditOrderInfoMode,
    setDraggedItem,
    setIsReordering,
    setSendingNotification,
    setShowSendEmailModal,
    setCustomEmailMessage,
    setShowPackingSlipForm,
    setPackingSlipData,
    validateRequiredFields,
    addHistoryEntry: async () => {},
    fetchOrder,
    fetchOrderItems,
    fetchOrderHistory,
    createAutomaticPackingSlip: async () => {},
    sendNotification: async () => {},
  });

  // --------------------------------------------------------------------------
  // NetSuite actions (push / create invoice / sync invoice) — same as before
  // --------------------------------------------------------------------------
  const [nsLoading, setNsLoading] = useState<string | null>(null);

  // Reconciliation runs once per (orderId) when an order has a so_number set
  // but no netsuite_so_id linkage yet. Hides the Push button while it runs.
  //
  // The "already started for this order" guard is a ref, NOT React state, so
  // calling setReconciling doesn't re-fire the effect mid-flight (which would
  // cancel itself and leave reconciling stuck at true forever). The finally
  // block also unconditionally clears the in-flight indicator — state updates
  // on an unmounted component are a noop in React 18.
  const reconcileStartedFor = useRef<string | null>(null);
  const [reconciling, setReconciling] = useState(false);
  useEffect(() => {
    if (!order || !order.id) return;
    if (order.netsuite_so_id) return;       // already linked, nothing to do
    if (!order.so_number) return;           // no number to look up
    if (reconcileStartedFor.current === order.id) return;

    reconcileStartedFor.current = order.id;
    setReconciling(true);

    (async () => {
      try {
        const res = await fetchWithAuth('/api/netsuite/reconcile-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: order.id }),
        });
        const data = await res.json();
        if (res.ok && data.reconciled) {
          await fetchOrder();
        }
        // On notFound / noop / failure: fall through. The existing Push
        // button stays visible so the admin can push manually.
      } catch {
        // Same fall-through behavior on network error.
      } finally {
        setReconciling(false);
      }
    })();
  }, [order?.id, order?.netsuite_so_id, order?.so_number, fetchOrder]);
  const handleNsAction = async (action: 'push-so' | 'create-invoice' | 'sync-invoice') => {
    if (action === 'push-so') {
      const ok = await confirm({
        title: 'Push order to NetSuite?',
        description:
          'This action will create a Purchase Order in NetSuite. Are you sure you want to continue?',
        confirmLabel: 'Push to NetSuite',
      });
      if (!ok) return;
    }
    setNsLoading(action);
    try {
      const res = await fetchWithAuth(`/api/netsuite/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      if (action === 'push-so') {
        const url = salesOrderUrl(data.nsSOId);
        toast.success(
          `Sales Order ${data.soNumber} created in NetSuite. Status moved to "In Process".`,
          url ? { href: { url, label: 'View in NetSuite' } } : undefined
        );
      } else if (action === 'create-invoice') {
        const url = invoiceUrl(data.nsInvoiceId);
        toast.success(
          `Invoice ${data.invoiceNumber} created in NetSuite. Status moved to "Ready".`,
          url ? { href: { url, label: 'View in NetSuite' } } : undefined
        );
      } else {
        toast.success(`Invoice synced from NetSuite (status: ${data.status}).`);
      }
      await fetchOrder();
    } catch (err: any) {
      toast.error(err.message || 'NetSuite request failed.');
    } finally {
      setNsLoading(null);
    }
  };

  // --------------------------------------------------------------------------
  // Loading / error
  // --------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading order…</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="px-6 py-8">
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error || 'Order not found.'}</AlertDescription>
        </Alert>
        <Link href={backUrl}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4" /> Back to orders
          </Button>
        </Link>
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // Derived: primary contextual NetSuite action
  // --------------------------------------------------------------------------
  const nsPrimary = (() => {
    if (order.status === 'Draft') return null;
    // While reconciliation is in flight on an order with so_number but no
    // netsuite_so_id, suppress the Push button — we may be about to discover
    // the SO already exists in NetSuite and showing Push would be wrong.
    if (
      reconciling &&
      !order.netsuite_so_id &&
      !!order.so_number
    ) {
      return null;
    }
    if (!order.netsuite_so_id) {
      return {
        action: 'push-so' as const,
        label: nsLoading === 'push-so' ? 'Pushing…' : 'Push to NetSuite',
      };
    }
    if (!order.netsuite_invoice_id) {
      return {
        action: 'create-invoice' as const,
        label: nsLoading === 'create-invoice' ? 'Creating…' : 'Create NS Invoice',
      };
    }
    // SO and Invoice both already in NetSuite — nothing primary to do.
    // (Refreshing invoice status moved out of the primary slot per spec.)
    return null;
  })();

  const canDelete =
    !!order.netsuite_so_id ||
    !!order.netsuite_invoice_id ||
    originalStatus === 'Cancelled' ||
    originalStatus === 'Draft';

  const showPackingSlipBtn = ['Ready', 'Done'].includes(originalStatus);
  const canDownload3PL = !!order.so_number && ['In Process', 'Ready', 'Done'].includes(order.status);
  const canSLI = ['Ready', 'Done'].includes(order.status);

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <div className="px-6 py-8 space-y-6">
      {/* Breadcrumb / back */}
      <div>
        <Link
          href={backUrl}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to orders
        </Link>
      </div>

      {/* Page header */}
      <PageHeader
        title={`Order ${order.po_number || order.id.substring(0, 6)}`}
        description={order.company?.company_name}
        actions={
          <>
            {/* Primary NS contextual action */}
            {reconciling && !order.netsuite_so_id && !!order.so_number ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2.5 py-1.5 rounded-md">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Checking NetSuite…
              </span>
            ) : nsPrimary ? (
              <Button
                size="sm"
                onClick={() => handleNsAction(nsPrimary.action)}
                loading={nsLoading === nsPrimary.action}
              >
                {nsPrimary.label}
              </Button>
            ) : null}

            {/* Edit */}
            <Link href={editUrl}>
              <Button size="sm" variant="outline">
                <Edit className="h-4 w-4" /> Edit
              </Button>
            </Link>

            {/* Send update */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSendEmailModal(true)}
              disabled={sendingNotification}
            >
              <Mail className="h-4 w-4" /> Send update
            </Button>

            {/* More menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="outline" aria-label="More actions">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {order.status !== 'Draft' && (
                  <DropdownMenuItem onClick={handleDownloadCSV}>
                    <Download className="h-4 w-4 mr-2" /> Download CSV
                  </DropdownMenuItem>
                )}
                {canDownload3PL && (
                  <DropdownMenuItem onClick={handleDownload3PLXLSX}>
                    <FileDown className="h-4 w-4 mr-2" /> Download 3PL XLSX
                  </DropdownMenuItem>
                )}

                {canSLI && (
                  <>
                    <DropdownMenuItem onClick={() => setShowSLIModal(true)} disabled={sliLoading}>
                      <FileText className="h-4 w-4 mr-2" />
                      {sliData ? 'Edit SLI' : 'Create SLI'}
                    </DropdownMenuItem>
                    {sliData && (
                      <DropdownMenuItem
                        onClick={() => window.open(`/admin/orders/${orderId}/sli-preview`, '_blank')}
                      >
                        <FileDown className="h-4 w-4 mr-2" /> Download SLI PDF
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                {showPackingSlipBtn && (
                  <>
                    <DropdownMenuSeparator />
                    {order.packing_slip_generated ? (
                      <DropdownMenuItem
                        onClick={() => (window.location.href = packingSlipUrl)}
                      >
                        <Package className="h-4 w-4 mr-2" /> View packing slip
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => setShowPackingSlipForm(true)}>
                        <Truck className="h-4 w-4 mr-2" /> Create packing slip
                      </DropdownMenuItem>
                    )}
                  </>
                )}

                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={handleDeleteOrder}
                      disabled={saving}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {saving ? 'Deleting…' : 'Delete order'}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      {/* Three info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Order Information */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">Order Information</CardTitle>
            {order.status !== 'Draft' && (
              <Button
                size="sm"
                variant={editOrderInfoMode ? 'default' : 'ghost'}
                onClick={() => {
                  if (editOrderInfoMode) {
                    handleSaveAdminOrderRefs();
                  } else {
                    setEditOrderInfoMode(true);
                  }
                }}
                loading={savingAdminFields}
              >
                {editOrderInfoMode ? 'Save' : 'Edit'}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {/* Row 1: PO Number (left) + Status (right) */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="PO Number">
                <span className="font-mono">{order.po_number || '—'}</span>
              </Field>
              <Field label="Status" align="right">
                {order.status !== 'Draft' && editOrderInfoMode ? (
                  <Select value={order.status} onValueChange={(v) => handleStatusChange(v)}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.filter((s) => {
                        if (order.netsuite_so_id && (s === 'Open' || s === 'Cancelled')) {
                          return s === order.status;
                        }
                        return true;
                      }).map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <StatusBadge status={order.status} />
                )}
              </Field>
            </div>

            {/* Row 2: Invoice Number (left) + SO Number (right) */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Invoice Number">
                {editOrderInfoMode ? (
                  <Input
                    value={adminInvoiceNumber}
                    onChange={(e) => setAdminInvoiceNumber(e.target.value)}
                    className={`h-8 ${
                      validateRequiredFields(order.status).includes('invoice_number')
                        ? 'border-destructive'
                        : ''
                    }`}
                    placeholder="—"
                  />
                ) : adminInvoiceNumber ? (
                  (() => {
                    const url = order.netsuite_invoice_id
                      ? invoiceUrl(order.netsuite_invoice_id)
                      : null;
                    return url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-accent underline-offset-4 hover:underline"
                        title="Open invoice in NetSuite"
                      >
                        {adminInvoiceNumber}
                      </a>
                    ) : (
                      <span className="font-mono">{adminInvoiceNumber}</span>
                    );
                  })()
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
              <Field label="SO Number" align="right">
                {editOrderInfoMode ? (
                  <Input
                    value={adminSoNumber}
                    onChange={(e) => setAdminSoNumber(e.target.value)}
                    className={`h-8 ${
                      validateRequiredFields(order.status).includes('so_number')
                        ? 'border-destructive'
                        : ''
                    }`}
                    placeholder="—"
                  />
                ) : adminSoNumber ? (
                  (() => {
                    const url = order.netsuite_so_id
                      ? salesOrderUrl(order.netsuite_so_id)
                      : null;
                    return url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-accent underline-offset-4 hover:underline"
                        title="Open SO in NetSuite"
                      >
                        {adminSoNumber}
                      </a>
                    ) : (
                      <span className="font-mono">{adminSoNumber}</span>
                    );
                  })()
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>
            </div>

            {/* Pallets — full width row of its own */}
            <Field label="Number of Pallets">
              {editOrderInfoMode ? (
                <Input
                  type="number"
                  min="1"
                  value={adminNumberOfPallets}
                  onChange={(e) => setAdminNumberOfPallets(e.target.value)}
                  className={`h-8 ${
                    validateRequiredFields(order.status).includes('number_of_pallets')
                      ? 'border-destructive'
                      : ''
                  }`}
                  placeholder="—"
                />
              ) : adminNumberOfPallets ? (
                <span className="font-mono">{adminNumberOfPallets}</span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </Field>

            <Separator className="my-1" />
            <div className="text-xs text-muted-foreground">
              Created {new Date(order.created_at).toLocaleString()}
              {creatorName && ` by ${creatorName}`}
            </div>
          </CardContent>
        </Card>

        {/* Bill To */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Bill To</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Company">
              <div>
                <div className="font-medium">{order.company?.company_name || '—'}</div>
                {order.company?.netsuite_number && (
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    NS {order.company.netsuite_number}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Ship To">
              <div className="text-sm whitespace-pre-line text-foreground">
                {order.company?.ship_to || <span className="text-muted-foreground">Not specified</span>}
              </div>
            </Field>
          </CardContent>
        </Card>

        {/* Order Summary */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Field label="Total">
              <span className="text-base font-semibold font-mono">{formatCurrency(order.total_value)}</span>
            </Field>
            <Field label="Credit Earned">
              <span className="font-mono text-emerald-700">{formatCurrency(order.credit_earned || 0)}</span>
            </Field>
            <Field label="Incoterm">
              <span>{order.company?.incoterm?.name || '—'}</span>
            </Field>
            <Field label="Payment Terms">
              <span>{order.company?.payment_term?.name || '—'}</span>
            </Field>
          </CardContent>
        </Card>
      </div>

      {/* Items */}
      <SectionHeader title="Items">
        {isReordering && (
          <span className="text-xs text-muted-foreground">Drag rows to reorder</span>
        )}
        <Button
          size="sm"
          variant={isReordering ? 'default' : 'outline'}
          onClick={() => setIsReordering((v) => !v)}
        >
          {isReordering ? 'Done reordering' : 'Reorder'}
        </Button>
      </SectionHeader>
      <Card>
        {orderItems.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-muted-foreground">
            No items on this order.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {isReordering && <TableHead className="w-12" />}
                <TableHead>Product</TableHead>
                <TableHead className="hidden sm:table-cell">SKU</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right hidden md:table-cell">Cases</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orderItems.map((item) => (
                <TableRow
                  key={item.id}
                  draggable={isReordering}
                  onDragStart={isReordering ? (e) => handleDragStart(e, item.id) : undefined}
                  onDragOver={isReordering ? handleDragOver : undefined}
                  onDrop={isReordering ? (e) => handleDrop(e, item.id) : undefined}
                  className={`${item.is_support_fund_item ? 'bg-emerald-50/40' : ''} ${
                    isReordering ? 'cursor-move' : ''
                  } ${draggedItem === item.id ? 'opacity-50' : ''}`}
                >
                  {isReordering && (
                    <TableCell className="text-muted-foreground text-center">⋮⋮</TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{item.product?.item_name || '—'}</span>
                      {item.is_support_fund_item && (
                        <Badge variant="success" className="text-[10px]">Support fund</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs">{item.product?.sku || '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatQuantity(item.quantity)}</TableCell>
                  <TableCell className="hidden md:table-cell text-right font-mono text-sm">{formatQuantity(item.case_qty || 0)}</TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm ${
                      item.is_support_fund_item ? 'text-emerald-700' : ''
                    }`}
                  >
                    {formatCurrency(item.unit_price)}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono text-sm font-medium ${
                      item.is_support_fund_item ? 'text-emerald-700' : ''
                    }`}
                  >
                    {formatCurrency(item.total_price)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Totals */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(() => {
            const regular = orderItems.filter((i) => !i.is_support_fund_item);
            const support = orderItems.filter((i) => i.is_support_fund_item);
            const regularSubtotal = regular.reduce((s, i) => s + (i.total_price || 0), 0);
            const supportSubtotal = support.reduce((s, i) => s + (i.total_price || 0), 0);
            const creditUsed = order.support_fund_used || 0;
            const balance = creditUsed - supportSubtotal;
            return (
              <>
                <Row label="Regular items" value={formatCurrency(regularSubtotal)} />
                <Row label="Credit used" value={formatCurrency(creditUsed)} valueClass="text-green-700" />
                <Row label="Balance" value={formatCurrency(balance)} valueClass="text-brand-magenta" />
                <Separator />
                <Row
                  label="Total order value"
                  value={formatCurrency(order.total_value)}
                  valueClass="text-base font-semibold"
                  labelClass="text-base font-semibold text-foreground"
                />
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* Documents */}
      <SectionHeader title="Documents">
        <OrderDocumentUpload
          orderId={orderId}
          onUploadComplete={() => setDocumentsRefreshKey((k) => k + 1)}
        />
      </SectionHeader>
      <Card>
        <CardContent className="pt-6">
          <AdminOrderDocumentsView key={documentsRefreshKey} orderId={orderId} />
        </CardContent>
      </Card>

      {/* History */}
      <SectionHeader title="History" />
      <Card>
        <CardContent className="pt-6">
          <AdminOrderHistoryView orderId={orderId} />
        </CardContent>
      </Card>

      {/* ===================================================================== */}
      {/* Modals                                                                 */}
      {/* ===================================================================== */}

      {/* Packing slip form modal */}
      <Dialog open={showPackingSlipForm} onOpenChange={setShowPackingSlipForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create packing slip</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <FormField label="Invoice number">
              <Input
                value={packingSlipData.invoice_number}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, invoice_number: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Shipping method">
              <Select
                value={packingSlipData.shipping_method || undefined}
                onValueChange={(v) =>
                  setPackingSlipData((p) => ({ ...p, shipping_method: v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Air">Air</SelectItem>
                  <SelectItem value="Ocean">Ocean</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="QIQI Sales Order">
              <Input
                value={packingSlipData.netsuite_reference}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, netsuite_reference: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Contact name">
              <Input
                value={packingSlipData.contact_name}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, contact_name: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Contact email">
              <Input
                type="email"
                value={packingSlipData.contact_email}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, contact_email: e.target.value }))
                }
              />
            </FormField>
            <FormField label="Contact phone">
              <Input
                value={packingSlipData.contact_phone}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, contact_phone: e.target.value }))
                }
              />
            </FormField>
            <FormField label="VAT number">
              <Input
                value={packingSlipData.vat_number}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, vat_number: e.target.value }))
                }
              />
            </FormField>
            <div className="md:col-span-2">
              <Label>Notes</Label>
              <textarea
                value={packingSlipData.notes}
                onChange={(e) =>
                  setPackingSlipData((p) => ({ ...p, notes: e.target.value }))
                }
                className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[96px]"
                placeholder="Any additional notes…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPackingSlipForm(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreatePackingSlip} loading={saving}>
              {saving ? 'Creating…' : 'Create packing slip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send email modal */}
      <Dialog open={showSendEmailModal} onOpenChange={setShowSendEmailModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send order update</DialogTitle>
            <DialogDescription>
              Send a custom email notification to the customer about this order.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>Custom message (optional)</Label>
            <textarea
              value={customEmailMessage}
              onChange={(e) => setCustomEmailMessage(e.target.value)}
              className="mt-1.5 w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 min-h-[120px]"
              placeholder="Anything specific you'd like to add…"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Email will be sent to the contact on this order, including order details.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSendEmailModal(false);
                setCustomEmailMessage('');
              }}
              disabled={sendingNotification}
            >
              Cancel
            </Button>
            <Button onClick={handleSendCustomEmail} loading={sendingNotification}>
              {sendingNotification ? 'Sending…' : 'Send email'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SLI modal (legacy component) */}
      <CreateSLIModal
        orderId={orderId}
        isOpen={showSLIModal}
        onClose={() => setShowSLIModal(false)}
        onSuccess={() => fetchSLI()}
        existingSLI={sliData}
        isEditMode={!!sliData}
      />
    </div>
  );
}

// ============================================================================
// Local helpers
// ============================================================================
function Field({
  label,
  children,
  align = 'left',
}: {
  label: string;
  children: React.ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <Label className="text-xs text-muted-foreground uppercase tracking-wider font-medium block">
        {label}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  labelClass,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  labelClass?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between">
      <span className={labelClass || 'text-sm text-muted-foreground'}>{label}</span>
      <span className={`${valueClass || 'text-sm font-medium'} font-mono`}>{value}</span>
    </div>
  );
}

/**
 * Section heading + optional actions on the right — used for Items,
 * Documents, History where we want the label OUTSIDE the surrounding card
 * (so it reads like a section heading, not a card title).
 */
function SectionHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mt-2 mb-3">
      <h2 className="text-lg font-semibold tracking-tight text-foreground">{title}</h2>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
