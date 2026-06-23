import { useCallback } from 'react';
import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { getStatusChangeEmailType } from './orderDetailsUtils';
import { useConfirm } from '../../ui/ConfirmProvider';
import { useToast } from '../../ui/ToastProvider';
import { salesOrderUrl, invoiceUrl } from '../../../../lib/netsuiteUrls';

export function useOrderDetailsController(params: {
  supabase: any;
  role: 'admin' | 'client';
  orderId: string;
  backUrl: string;

  // state values used by handlers
  order: any;
  orderItems: any[];
  originalStatus: string;
  editOrderInfoMode: boolean;
  draggedItem: string | null;
  packingSlipData: any;
  customEmailMessage: string;
  adminInvoiceNumber: string;
  adminSoNumber: string;
  adminNumberOfPallets: string;

  // setters / state controls
  setOrder: (updater: any) => void;
  setOrderItems: (v: any) => void;
  setOriginalStatus: (v: string) => void;
  setError: (v: string) => void;
  setSaving: (v: boolean) => void;
  setSavingAdminFields: (v: boolean) => void;
  setEditOrderInfoMode: (v: boolean) => void;
  setDraggedItem: (v: string | null) => void;
  setIsReordering: (v: boolean) => void;
  setSendingNotification: (v: boolean) => void;
  setShowSendEmailModal: (v: boolean) => void;
  setCustomEmailMessage: (v: string) => void;
  setShowPackingSlipForm: (v: boolean) => void;
  setPackingSlipData: (v: any) => void;

  // callbacks from view (keep API/navigation behavior identical)
  validateRequiredFields: (status: string) => string[];
  addHistoryEntry: (...args: any[]) => Promise<void>;
  fetchOrder: () => Promise<void>;
  fetchOrderItems: () => Promise<void>;
  fetchOrderHistory: () => Promise<void>;
  createAutomaticPackingSlip: () => Promise<void>;
  sendNotification: (type: string, customMessage?: string) => Promise<void>;
}): {
  handleCreatePackingSlip: () => Promise<void>;
  handleSaveAdminOrderRefs: () => Promise<void>;
  handleReorderProducts: (newOrder: any[]) => Promise<void>;
  moveItem: (fromIndex: number, toIndex: number) => any[];
  handleDragStart: (e: React.DragEvent, itemId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetItemId: string) => void;
  handleStatusChange: (newStatus: string) => void;
  handleSendCustomEmail: () => Promise<void>;
  handleDownloadCSV: () => Promise<void>;
  handleDeleteOrder: () => Promise<void>;
} {
  const {
    supabase,
    role,
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
    addHistoryEntry,
    fetchOrder,
    fetchOrderItems,
    fetchOrderHistory,
    createAutomaticPackingSlip,
    sendNotification,
  } = params;

  const confirm = useConfirm();
  const toast = useToast();

  const handleCreatePackingSlip = useCallback(async () => {
    try {
      setSaving(true);

      const { data, error } = await supabase
        .from('packing_slips')
        .insert({
          order_id: orderId,
          invoice_number: packingSlipData.invoice_number,
          shipping_method: packingSlipData.shipping_method,
          netsuite_reference: packingSlipData.netsuite_reference,
          notes: packingSlipData.notes,
          contact_name: packingSlipData.contact_name,
          contact_email: packingSlipData.contact_email,
          contact_phone: packingSlipData.contact_phone,
          vat_number: packingSlipData.vat_number,
          created_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      console.log('Packing slip created:', data);

      // Update order to mark packing slip as generated
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          packing_slip_generated: true,
          packing_slip_generated_at: new Date().toISOString(),
          packing_slip_generated_by: (await supabase.auth.getUser()).data.user?.id,
        })
        .eq('id', orderId);

      if (updateError) throw updateError;
      console.log('Order updated with packing_slip_generated = true');

      // Add history entry for packing slip creation
      await addHistoryEntry('packing_slip_created', undefined, undefined, 'Packing slip created and generated', {
        invoice_number: packingSlipData.invoice_number,
        shipping_method: packingSlipData.shipping_method,
        netsuite_reference: packingSlipData.netsuite_reference,
      });

      // Close popup and reset form first
      setShowPackingSlipForm(false);
      setPackingSlipData({
        invoice_number: '',
        shipping_method: '',
        netsuite_reference: '',
        notes: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        vat_number: '',
      });

      // Refresh order data after a short delay to ensure database consistency
      setTimeout(async () => {
        console.log('Refreshing order data...');
        await fetchOrder();
        console.log('Order data refreshed, packing_slip_generated:', order?.packing_slip_generated);
      }, 100);
    } catch (error: any) {
      console.error('Error creating packing slip:', error);
      setError(error.message);
    } finally {
      setSaving(false);
    }
  }, [addHistoryEntry, fetchOrder, order?.packing_slip_generated, orderId, packingSlipData, setError, setPackingSlipData, setSaving, setShowPackingSlipForm, supabase]);

  const handleSaveAdminOrderRefs = useCallback(async () => {
    if (!order) return;

    // Validate required fields before saving
    const validationErrors = validateRequiredFields(order.status);
    if (validationErrors.length > 0) {
      // Don't save if validation fails - the red borders will show the issues
      return;
    }

    try {
      setSavingAdminFields(true);
      const numberOfPallets = adminNumberOfPallets ? parseInt(adminNumberOfPallets, 10) : null;
      const oldStatus = originalStatus;
      const { error } = await supabase
        .from('orders')
        .update({
          status: order.status,
          invoice_number: adminInvoiceNumber || null,
          so_number: adminSoNumber || null,
          number_of_pallets: numberOfPallets,
        })
        .eq('id', orderId);
      if (error) throw error;
      setOrder((prev: any) =>
        prev
          ? ({
              ...prev,
              invoice_number: adminInvoiceNumber || null,
              so_number: adminSoNumber || null,
              number_of_pallets: numberOfPallets,
            } as any)
          : prev
      );

      // Update original status to reflect the saved status
      setOriginalStatus(order.status);

      // Add history entry for status change if status changed
      if (oldStatus !== order.status) {
        await addHistoryEntry('status_change', oldStatus, order.status, `Status changed from ${oldStatus} to ${order.status}`);

        // Recalculate target periods if status changed to/from Done
        const statusChangedToDone = order.status === 'Done' && oldStatus !== 'Done';
        const statusChangedFromDone = oldStatus === 'Done' && order.status !== 'Done';
        if ((statusChangedToDone || statusChangedFromDone) && order.company_id) {
          try {
            await fetch('/api/target-periods/recalculate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId: order.company_id }),
            });
          } catch (recalcError) {
            // Log but don't throw - recalculation failure shouldn't block status change
            console.error('Failed to recalculate target periods:', recalcError);
          }
        }

        // Send automatic email notification for specific status changes
        try {
          const emailType = getStatusChangeEmailType(order.status);

          if (emailType) {
            await fetchWithAuth('/api/orders/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderId: order.id,
                emailType,
              }),
            });
          }
        } catch (emailError) {
          // Log but don't throw - email failure shouldn't block status change
          console.error('Failed to send status change email:', emailError);
        }

        // Send notification if status changed to certain states
        if (['In Process', 'Done'].includes(order.status)) {
          await sendNotification('status_change');
        }

        // Refresh order history to show the new status change
        if (role === 'admin') {
          fetchOrderHistory();
        }
      }

      // Clear any errors since data is now saved
      setError('');

      // Create packing slip automatically if status is Ready and no packing slip exists
      if (order.status === 'Ready' && !order.packing_slip_generated) {
        await createAutomaticPackingSlip();
      }

      // Exit edit mode after successful save
      setEditOrderInfoMode(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingAdminFields(false);
    }
  }, [
    addHistoryEntry,
    adminInvoiceNumber,
    adminNumberOfPallets,
    adminSoNumber,
    createAutomaticPackingSlip,
    fetchOrderHistory,
    order,
    orderId,
    originalStatus,
    role,
    sendNotification,
    setEditOrderInfoMode,
    setError,
    setOrder,
    setOriginalStatus,
    setSavingAdminFields,
    supabase,
    validateRequiredFields,
  ]);

  const handleReorderProducts = useCallback(
    async (newOrder: any[]) => {
      try {
        // Update sort_order for each item
        const updates = newOrder.map((item, index) => supabase.from('order_items').update({ sort_order: index }).eq('id', item.id));

        await Promise.all(updates);

        // Refresh order items
        await fetchOrderItems();
      } catch (err: any) {
        console.error('Error reordering products:', err);
        setError('Failed to reorder products. Please try again.');
      }
    },
    [fetchOrderItems, setError, supabase]
  );

  const moveItem = useCallback(
    (fromIndex: number, toIndex: number) => {
      const newItems = [...orderItems];
      const [movedItem] = newItems.splice(fromIndex, 1);
      newItems.splice(toIndex, 0, movedItem);
      setOrderItems(newItems);
      return newItems;
    },
    [orderItems, setOrderItems]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, itemId: string) => {
      setDraggedItem(itemId);
      e.dataTransfer.effectAllowed = 'move';
    },
    [setDraggedItem]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, targetItemId: string) => {
      e.preventDefault();

      if (!draggedItem || draggedItem === targetItemId) {
        setDraggedItem(null);
        return;
      }

      const fromIndex = orderItems.findIndex((item) => item.id === draggedItem);
      const toIndex = orderItems.findIndex((item) => item.id === targetItemId);

      if (fromIndex !== -1 && toIndex !== -1) {
        const newOrder = moveItem(fromIndex, toIndex);
        handleReorderProducts(newOrder);
      }

      setDraggedItem(null);
    },
    [draggedItem, handleReorderProducts, moveItem, orderItems, setDraggedItem]
  );

  const handleStatusChange = useCallback(
    (newStatus: string) => {
      if (!order) return;

      // Only allow status changes when in edit mode
      if (!editOrderInfoMode) {
        return;
      }

      // Only update local state - don't save to database until Save button is clicked
      setOrder((prev: any) => (prev ? { ...prev, status: newStatus } : null));
    },
    [editOrderInfoMode, order, setOrder]
  );

  const handleSendCustomEmail = useCallback(async () => {
    if (!order) return;

    setSendingNotification(true);
    try {
      const response = await fetchWithAuth('/api/orders/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          emailType: 'custom',
          customMessage: customEmailMessage,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setShowSendEmailModal(false);
        setCustomEmailMessage('');
        toast.success('Email sent.');
      } else {
        toast.error(`Failed to send email: ${data.error}`);
      }
    } catch (err: any) {
      toast.error(`Error sending email: ${err.message}`);
    } finally {
      setSendingNotification(false);
    }
  }, [customEmailMessage, order, setCustomEmailMessage, setSendingNotification, setShowSendEmailModal, toast]);

  const handleDownloadCSV = useCallback(async () => {
    try {
      // admin-only action
      if (role !== 'admin') return;
      const { generateNetSuiteCSV, downloadCSV } = await import('../../../../lib/csvExport');
      const { data: orderData, error } = await supabase
        .from('orders')
        .select(
          `
          *,
          company:companies(
            company_name,
            netsuite_number,
            class:classes(name),
            subsidiary:subsidiaries(name),
            location:Locations(location_name)
          ),
          order_items(
            quantity,
            unit_price,
            total_price,
            product:Products(sku, item_name, netsuite_name)
          )
        `
        )
        .eq('id', orderId)
        .single();

      if (error) throw error;
      if (!orderData) throw new Error('Order not found');
      if (!orderData.company) throw new Error('Company data not found for this order');
      if (!orderData.order_items?.length) throw new Error('No order items found for this order');
      // Validate that all order items have product SKUs
      for (const item of orderData.order_items) {
        if (!item.product?.sku) throw new Error('Product SKU missing for order item');
      }
      const csvContent = generateNetSuiteCSV(orderData as any);
      const orderDate = new Date(orderData.created_at);
      const dateStr = orderDate.toISOString().split('T')[0];
      const poNumber = orderData.po_number || orderData.id.substring(0, 6);
      const filename = `Order_${poNumber}_${dateStr}.csv`;
      downloadCSV(csvContent, filename);
    } catch (err) {
      console.error('CSV error', err);
      toast.error('Failed to export CSV.');
    }
  }, [orderId, role, supabase, toast]);

  const handleDeleteOrder = useCallback(async () => {
    const nsSoId = (order as any)?.netsuite_so_id as string | null;
    const nsInvoiceId = (order as any)?.netsuite_invoice_id as string | null;
    const nsSoNumber = (order as any)?.so_number as string | null;
    const nsInvoiceNumber = (order as any)?.invoice_number as string | null;
    const hasNsLink = !!(nsSoId || nsInvoiceId);

    let proceed: boolean;

    if (hasNsLink) {
      if (role !== 'admin') {
        toast.error('Only admins can delete NetSuite-linked orders.');
        return;
      }
      const bullets: Array<{ label: string; href?: string }> = [];
      if (nsInvoiceId) {
        const url = invoiceUrl(nsInvoiceId);
        bullets.push({
          label: `NetSuite Invoice ${nsInvoiceNumber || `(ID ${nsInvoiceId})`}`,
          href: url || undefined,
        });
      }
      if (nsSoId) {
        const url = salesOrderUrl(nsSoId);
        bullets.push({
          label: `NetSuite Sales Order ${nsSoNumber || `(ID ${nsSoId})`}`,
          href: url || undefined,
        });
      }

      proceed = await confirm({
        title: 'Delete order and NetSuite records?',
        description: 'This order is linked to NetSuite. Deleting it will also delete the following records from NetSuite:',
        bullets,
        warning: 'If the invoice has any payment applied in NetSuite, deletion will be blocked and you\'ll need to reverse the payment first.',
        confirmLabel: 'Delete from Hub + NetSuite',
        cancelLabel: 'Cancel',
        variant: 'danger',
        requireExplicitConfirm: true,
      });
    } else {
      if (originalStatus !== 'Cancelled' && originalStatus !== 'Draft') {
        toast.error('Only Cancelled or Draft orders can be deleted.');
        return;
      }
      if (originalStatus === 'Cancelled' && role !== 'admin') {
        toast.error('Only admins can delete cancelled orders.');
        return;
      }
      proceed = await confirm({
        title: `Delete ${originalStatus} order?`,
        description: 'This action cannot be undone.',
        confirmLabel: 'Delete Order',
        variant: 'danger',
      });
    }

    if (!proceed) return;

    try {
      setSaving(true);

      const response = await fetchWithAuth(`/api/orders/delete?orderId=${orderId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete order');
      }

      toast.success('Order deleted.');
      window.location.href = backUrl;
    } catch (err: any) {
      console.error('Error deleting order:', err);
      toast.error(err.message || 'Failed to delete order');
    } finally {
      setSaving(false);
    }
  }, [backUrl, confirm, order, orderId, originalStatus, role, setSaving, toast]);

  return {
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
    handleDeleteOrder,
  };
}

