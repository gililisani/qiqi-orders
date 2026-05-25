import React from 'react';
import { addOrderHistoryEntry } from '../../../../lib/orderHistory';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import {
  buildAutoSaveDraftBody,
  buildOrderItemsInsertData,
  buildOrderItemsUpdateData,
  generatePoNumber,
} from './orderPayload';
import { validatePerformSave } from './orderValidation';

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
        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('No user found');

        const validationError = validatePerformSave({
          company,
          orderItemsCount: orderItems.length,
          supportFundItemsCount: supportFundItems.length,
        });
        if (validationError) throw new Error(validationError);
        // Keep explicit guard for type narrowing (and to preserve original structure).
        if (!company) {
          throw new Error('No company selected');
        }

        if (isNewMode) {
          const poNumber = generatePoNumber((order && order.po_number) || null);

          // Log order creation details for debugging
          console.log('Creating order with details:', {
            company_id: company.id,
            company_name: company.company_name,
            user_id: user.id,
            po_number: poNumber,
            status: asDraft ? 'Draft' : 'Open',
            role: role,
          });

          // Create new order — snapshot location_id from company so the
          // fulfilling location is frozen even if the company is later
          // re-pointed to a different location (e.g. the 3PL relocation).
          const { data: newOrder, error: orderError } = await supabase
            .from('orders')
            .insert({
              company_id: company.id,
              user_id: user.id,
              po_number: poNumber,
              status: asDraft ? 'Draft' : 'Open',
              location_id: (company as any).location_id ?? null,
            })
            .select()
            .single();

          if (orderError) throw orderError;

          console.log('Order created successfully:', {
            order_id: newOrder.id,
            company_id: newOrder.company_id,
          });

          const allItemsData = buildOrderItemsInsertData(newOrder.id, orderItems as any, supportFundItems as any);

          if (allItemsData.length > 0) {
            const { error: insertError } = await supabase.from('order_items').insert(allItemsData);

            if (insertError) throw insertError;
          }

          // Calculate and update order totals
          const originalTotals = getOrderTotals();
          const supportTotals = getSupportFundTotals();

          const supportFundUsed = Math.min(supportTotals.subtotal, originalTotals.supportFundEarned);
          const additionalCost = Math.max(0, supportTotals.subtotal - originalTotals.supportFundEarned);
          const finalTotal = originalTotals.total + additionalCost;

          const { error: updateTotalsError } = await supabase
            .from('orders')
            .update({
              total_value: finalTotal,
              support_fund_used: supportFundUsed,
              credit_earned: originalTotals.supportFundEarned,
            })
            .eq('id', newOrder.id);

          if (updateTotalsError) throw updateTotalsError;

          // Add history entry for order creation
          try {
            await addOrderHistoryEntry({
              supabase,
              orderId: newOrder.id,
              actionType: 'order_created',
              statusFrom: undefined,
              statusTo: asDraft ? 'Draft' : 'Open',
              notes: `Order created with ${allItemsData.length} items`,
              metadata: {
                po_number: poNumber,
                total_items: allItemsData.length,
                total_value: finalTotal,
                support_fund_used: supportFundUsed,
                credit_earned: originalTotals.supportFundEarned,
              },
              role: role as any,
            });
          } catch (historyError) {
            console.error('Failed to create history entry:', historyError);
            // Don't block order creation if history fails
          }

          // Send order created email (fire and forget - don't block redirect)
          // Only send email for non-draft orders
          if (!asDraft) {
            // Use setTimeout to ensure order is fully committed to database
            setTimeout(async () => {
              try {
                // Send email to client
                await fetchWithAuth('/api/orders/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderId: newOrder.id,
                    emailType: 'created',
                  }),
                });

                // Send notification email to orders@qiqiglobal.com
                await fetchWithAuth('/api/orders/send-notification', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderId: newOrder.id,
                  }),
                });
              } catch (emailError) {
                // Log but don't throw - email failure shouldn't block order creation
                console.error('Failed to send order created email:', emailError);
              }
            }, 1000); // 1 second delay to ensure DB commit
          }

          // Clear unsaved changes flag
          setHasUnsavedChanges(false);

          // Redirect to order view
          router.push(`/${role}/orders/${newOrder.id}`);
        } else {
          // Update existing order
          const originalTotals = getOrderTotals();
          const supportTotals = getSupportFundTotals();

          const supportFundUsed = Math.min(supportTotals.subtotal, originalTotals.supportFundEarned);
          const additionalCost = Math.max(0, supportTotals.subtotal - originalTotals.supportFundEarned);
          const finalTotal = originalTotals.total + additionalCost;

          // Determine status: if current is Draft, allow conversion to Open or Draft
          const newStatus = asDraft ? 'Draft' : order?.status === 'Draft' ? 'Open' : order?.status;

          const { error: updateError } = await supabase
            .from('orders')
            .update({
              po_number: (order && order.po_number) || null,
              status: newStatus,
              total_value: finalTotal,
              support_fund_used: supportFundUsed,
              credit_earned: originalTotals.supportFundEarned,
            })
            .eq('id', orderId);

          if (updateError) throw updateError;

          // Delete existing order items
          const { error: deleteError } = await supabase.from('order_items').delete().eq('order_id', orderId);

          if (deleteError) throw deleteError;

          const allItemsData = buildOrderItemsUpdateData(orderId, orderItems as any, supportFundItems as any);

          if (allItemsData.length > 0) {
            const { error: insertError } = await supabase.from('order_items').insert(allItemsData);

            if (insertError) throw insertError;
          }

          // Add history entry for order update
          try {
            const oldStatus = order?.status;
            await addOrderHistoryEntry({
              supabase,
              orderId: orderId,
              actionType: oldStatus !== newStatus ? 'status_change' : 'order_updated',
              statusFrom: oldStatus !== newStatus ? oldStatus : undefined,
              statusTo: oldStatus !== newStatus ? newStatus : undefined,
              notes:
                oldStatus !== newStatus
                  ? `Status changed from ${oldStatus} to ${newStatus}`
                  : `Order updated with ${allItemsData.length} items`,
              metadata: {
                total_items: allItemsData.length,
                total_value: finalTotal,
                support_fund_used: supportFundUsed,
                credit_earned: originalTotals.supportFundEarned,
              },
              role: role as any,
            });
          } catch (historyError) {
            console.error('Failed to create history entry:', historyError);
            // Don't block order update if history fails
          }

          // Send order updated email notification (fire and forget)
          // IMPORTANT: do not email when saving as Draft (Draft -> Draft, or Open -> Draft).
          if (newStatus !== 'Draft') {
            setTimeout(async () => {
              try {
                await fetchWithAuth('/api/orders/send-email', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    orderId: orderId,
                    emailType: 'updated',
                  }),
                });
              } catch (emailError) {
                console.error('Failed to send order updated email:', emailError);
              }
            }, 1000); // 1 second delay to ensure DB commit
          }

          // Clear unsaved changes flag
          setHasUnsavedChanges(false);

          // Redirect back to order view
          router.push(`/${role}/orders/${orderId}`);
        }
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
      supabase,
      company,
      orderItems,
      supportFundItems,
      isNewMode,
      order,
      role,
      router,
      orderId,
      getOrderTotals,
      getSupportFundTotals,
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

