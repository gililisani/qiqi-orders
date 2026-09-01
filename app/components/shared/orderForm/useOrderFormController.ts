import React from 'react';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { validatePerformSave } from './orderValidation';

// ---------------------------------------------------------------------------
// Email triggers — fire-and-forget after order create / open-transition.
//
// Two calls fire in PARALLEL (not sequential): if the customer email is slow
// or fails, the admin notification still goes out, and vice versa. Each is
// posted with keepalive:true so the browser keeps the request alive across
// the navigation that happens right after submit.
//
// Errors are logged but never thrown — email failure must not block the
// order being saved or the redirect.
// ---------------------------------------------------------------------------
function fireBoth(
  orderId: string,
  emailType: 'created' | 'updated',
): void {
  const post = (path: string, body: object) =>
    fetchWithAuth(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // keepalive lets the browser finish the request even after the page
      // unloads/navigates. Critical because the trigger fires inside a
      // setTimeout right before router.push.
      keepalive: true,
    } as RequestInit).catch((err) => {
      console.error(`[order-email] ${path} failed:`, err);
    });

  // Customer email.
  post('/api/orders/send-email', { orderId, emailType });
  // Admin notification — only relevant for "new order" events, not edits.
  if (emailType === 'created') {
    post('/api/orders/send-notification', { orderId });
  }
}

function fireOrderCreatedEmails(orderId: string): void {
  fireBoth(orderId, 'created');
}

function fireOrderUpdatedEmail(orderId: string): void {
  fireBoth(orderId, 'updated');
}

export function useOrderFormController(params: {
  supabase: any;
  router: any;
  role: string;
  orderId: any;
  isNewMode: boolean;
  order: any;
  company: any;
  orderItems: any[];
  supportFundItems: any[];
  saving: boolean;
  performSaveInFlightRef: React.MutableRefObject<boolean>;
  setSaving: (v: boolean) => void;
  setError: (v: any) => void;
  setHasUnsavedChanges: (v: boolean) => void;
  setShowSupportFundReminder: (v: boolean) => void;
  getOrderTotals: () => any;
  getSupportFundTotals: () => any;
}): {
  performSave: (asDraft?: boolean) => Promise<void>;
  handleSave: () => Promise<void>;
  handleSaveAsDraft: () => Promise<void>;
} {
  const {
    supabase,
    router,
    role,
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
  } = params;

  const performSave = React.useCallback(
    async (asDraft: boolean = false) => {
      if (performSaveInFlightRef.current) {
        return;
      }
      performSaveInFlightRef.current = true;
      try {
        const validationError = validatePerformSave({
          company,
          orderItemsCount: orderItems.length,
          supportFundItemsCount: supportFundItems.length,
          shipmentType: (order && order.shipment_type) || null,
        });
        if (validationError) throw new Error(validationError);
        // Keep explicit guard for type narrowing (and to preserve original structure).
        if (!company) {
          throw new Error('No company selected');
        }

        // Server-side save (audit P3 follow-through): the browser sends only
        // product ids + quantities in DISPLAY order (regular items first,
        // support-fund items after — sort_order is positional). Every money
        // field is computed server-side from the catalog, and the write is
        // one transaction. The on-screen totals (getOrderTotals) are display
        // only — the server's math is the same, but the server's is the one
        // that's stored.
        const itemsPayload = [
          ...orderItems.map((item: any) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            case_qty: item.case_qty || 0,
            is_support_fund_item: false,
          })),
          ...supportFundItems.map((item: any) => ({
            product_id: item.product_id,
            quantity: item.quantity,
            case_qty: item.case_qty || 0,
            is_support_fund_item: true,
          })),
        ];

        const res = await fetchWithAuth('/api/orders/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: isNewMode ? 'create' : 'update',
            ...(isNewMode ? {} : { orderId }),
            companyId: company.id,
            poNumber: (order && order.po_number) || null,
            shipmentType: (order && order.shipment_type) || null,
            asDraft,
            items: itemsPayload,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to save order.');
        }

        const savedOrderId: string = data.orderId;
        const newStatus: string = data.status;

        // Email triggers (fire and forget — don't block redirect).
        //
        //  (a) Created as Open, or Draft → Open promotion: functionally a
        //      "new order" for the admin team — customer email AND admin
        //      notification.
        //  (b) Open → Open edit: customer "updated" email only.
        //  We never email on Drafts.
        if (newStatus !== 'Draft') {
          const goingOpenForFirstTime = isNewMode || (data.wasDraft && newStatus === 'Open');
          setTimeout(() => {
            if (goingOpenForFirstTime) {
              fireOrderCreatedEmails(savedOrderId);
            } else {
              fireOrderUpdatedEmail(savedOrderId);
            }
          }, 1000); // 1s delay to make sure the order row is committed
        }

        // Clear unsaved changes flag
        setHasUnsavedChanges(false);

        // Redirect to order view
        router.push(`/${role}/orders/${savedOrderId}`);
      } catch (error: any) {
        console.error('Error saving order:', error);
        // Log more details for debugging
        if (error.message) console.error('Error message:', error.message);
        if (error.details) console.error('Error details:', error.details);
        if (error.hint) console.error('Error hint:', error.hint);
        setError(error instanceof Error ? error.message : 'Failed to save order');
      } finally {
        performSaveInFlightRef.current = false;
        setSaving(false);
      }
    },
    [
      performSaveInFlightRef,
      company,
      orderItems,
      supportFundItems,
      isNewMode,
      order,
      role,
      router,
      orderId,
      setHasUnsavedChanges,
      setError,
      setSaving,
    ]
  );

  const handleSave = React.useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      // Check if user has earned credit but hasn't used any support funds
      const totals = getOrderTotals();
      const hasEarnedCredit = totals.supportFundEarned > 0;
      const hasUsedSupportFunds = supportFundItems.length > 0;

      if (hasEarnedCredit && !hasUsedSupportFunds) {
        setShowSupportFundReminder(true);
        setSaving(false);
        return;
      }

      // Proceed with save
      await performSave(false);
    } catch (error) {
      console.error('Error in handleSave:', error);
      setError(error instanceof Error ? error.message : 'Failed to save order');
      setSaving(false);
    }
  }, [getOrderTotals, performSave, setError, setSaving, setShowSupportFundReminder, supportFundItems.length]);

  const handleSaveAsDraft = React.useCallback(async () => {
    try {
      setSaving(true);
      setError(null);

      // Save as draft (skip support fund reminder check)
      await performSave(true);
    } catch (error: any) {
      console.error('Error in handleSaveAsDraft:', error);
      // Log more details for debugging
      if (error.message) console.error('Draft error message:', error.message);
      if (error.details) console.error('Draft error details:', error.details);
      if (error.hint) console.error('Draft error hint:', error.hint);
      setError(error instanceof Error ? error.message : 'Failed to save draft');
      setSaving(false);
    }
  }, [performSave, setError, setSaving]);

  return { performSave, handleSave, handleSaveAsDraft };
}

