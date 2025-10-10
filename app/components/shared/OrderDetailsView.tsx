'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSupabase } from '../../../lib/supabase-provider';
import Card from '../ui/Card';
import { Spinner, Typography } from '../MaterialTailwind';
import Link from 'next/link';
import OrderDocumentUpload from './OrderDocumentUpload';
import OrderDocumentsView from './OrderDocumentsView';
import OrderHistoryView from './OrderHistoryView';
import OrderStatusBadge from '../ui/OrderStatusBadge';
import { formatCurrency, formatQuantity } from '../../../lib/formatters';

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
  packing_slip_generated_at?: string;
  packing_slip_generated_by?: string;
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
  case_qty?: number;
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

interface OrderHistory {
  id: string;
  order_id: string;
  status_from: string | null;
  status_to: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_by_role: string | null;
  notes: string | null;
  netsuite_sync_status: string | null;
  created_at: string;
}

interface OrderDetailsViewProps {
  role: 'admin' | 'client';
  orderId: string;
  backUrl: string;
  editUrl: string;
  packingSlipUrl: string;
}

const statusOptions = [
  { value: 'Open', label: 'Open' },
  { value: 'In Process', label: 'In Process' },
  { value: 'Ready', label: 'Ready' },
  { value: 'Done', label: 'Done' },
  { value: 'Cancelled', label: 'Cancelled' }
];

export default function OrderDetailsView({ 
  role, 
  orderId, 
  backUrl, 
  editUrl, 
  packingSlipUrl
}: OrderDetailsViewProps) {
  const { supabase } = useSupabase();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [orderHistory, setOrderHistory] = useState<OrderHistory[]>([]);
  const [error, setError] = useState('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [showPackingSlipForm, setShowPackingSlipForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [packingSlipData, setPackingSlipData] = useState({
    invoice_number: '',
    shipping_method: '',
    netsuite_reference: '',
    notes: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    vat_number: ''
  });
  
  // Admin-specific states
  const [isReordering, setIsReordering] = useState(false);
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [sendingNotification, setSendingNotification] = useState(false);
  const [documentsRefreshKey, setDocumentsRefreshKey] = useState(0);
  const [showSendEmailModal, setShowSendEmailModal] = useState(false);
  const [customEmailMessage, setCustomEmailMessage] = useState('');

  const handleDocumentUploadComplete = () => {
    setDocumentsRefreshKey(prev => prev + 1);
  };

  // Helper function to add history entries
  const addHistoryEntry = async (
    actionType: string,
    statusFrom?: string,
    statusTo?: string,
    notes?: string,
    metadata?: any
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user profile for name
      let userName = 'Unknown';
      let userRole = 'system';

      if (role === 'admin') {
        const { data: adminProfile } = await supabase
          .from('admins')
          .select('name')
          .eq('id', user.id)
          .single();
        userName = adminProfile?.name || 'Admin';
        userRole = 'admin';
      } else {
        const { data: clientProfile } = await supabase
          .from('clients')
          .select('name')
          .eq('id', user.id)
          .single();
        userName = clientProfile?.name || 'Client';
        userRole = 'client';
      }

      await supabase
        .from('order_history')
        .insert({
          order_id: orderId,
          action_type: actionType,
          status_from: statusFrom,
          status_to: statusTo,
          notes: notes,
          changed_by_id: user.id,
          changed_by_name: userName,
          changed_by_role: userRole,
          metadata: metadata
        });
    } catch (error) {
      console.error('Error adding history entry:', error);
    }
  };

  const handleCreatePackingSlip = async () => {
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
          created_by: (await supabase.auth.getUser()).data.user?.id
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
          packing_slip_generated_by: (await supabase.auth.getUser()).data.user?.id
        })
        .eq('id', orderId);

      if (updateError) throw updateError;
      console.log('Order updated with packing_slip_generated = true');

      // Add history entry for packing slip creation
      await addHistoryEntry(
        'packing_slip_created',
        undefined,
        undefined,
        'Packing slip created and generated',
        {
          invoice_number: packingSlipData.invoice_number,
          shipping_method: packingSlipData.shipping_method,
          netsuite_reference: packingSlipData.netsuite_reference
        }
      );

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
        vat_number: ''
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
  };
  const [adminInvoiceNumber, setAdminInvoiceNumber] = useState<string>('');
  const [adminSoNumber, setAdminSoNumber] = useState<string>('');
  const [adminNumberOfPallets, setAdminNumberOfPallets] = useState<string>('');
  const [savingAdminFields, setSavingAdminFields] = useState<boolean>(false);
  const [editOrderInfoMode, setEditOrderInfoMode] = useState<boolean>(false);
  const [originalStatus, setOriginalStatus] = useState<string>('');

  useEffect(() => {
    if (orderId) {
      fetchCurrentUser();
      fetchOrder();
      fetchOrderItems();
      if (role === 'admin') {
        fetchOrderHistory();
      }
    }
  }, [orderId, role]);

  const fetchCurrentUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const table = role === 'admin' ? 'admins' : 'clients';
      const { data: userData, error } = await supabase
        .from(table)
        .select('name')
        .eq('id', user.id)
        .single();

      if (!error && userData?.name) {
        setCurrentUserName(userData.name);
      }
    } catch (err) {
      console.error('Error fetching current user:', err);
    }
  };

  const fetchOrder = async () => {
    try {
      if (role === 'client') {
        // Client: fetch order with user restriction
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not found');

        const { data, error } = await supabase
          .from('orders')
          .select(`
            *,
            packing_slip_generated,
            packing_slip_generated_at,
            packing_slip_generated_by,
            company:companies(
              company_name,
              netsuite_number,
              ship_to,
              support_fund:support_fund_levels(percent),
              incoterm:incoterms(name),
              payment_term:payment_terms(name)
            )
          `)
          .eq('id', orderId)
          .eq('user_id', user.id)
          .single();

        if (error) throw error;
        setOrder(data);
        setOriginalStatus(data.status || '');
      } else {
        // Admin: fetch order with all related data
        const { data: orderData, error: orderError } = await supabase
          .from('orders')
          .select('*, packing_slip_generated, packing_slip_generated_at, packing_slip_generated_by, invoice_number, so_number')
          .eq('id', orderId)
          .single();

        if (orderError) throw orderError;

        // Fetch related data separately with error handling
        let clientResult: any = { data: null, error: null };
        let companyResult: any = { data: null, error: null };

        try {
          // Smart approach: Check if user is admin first, then fetch from appropriate table
          // First, try admins table (since orders can be created by admins)
          const { data: adminData, error: adminError } = await supabase
            .from('admins')
            .select('name, email')
            .eq('id', orderData.user_id)
            .single();
          
          if (!adminError && adminData) {
            clientResult = { data: adminData, error: null };
          } else {
            // If not found in admins, try clients table
            const { data: clientData, error: clientError } = await supabase
              .from('clients')
              .select('name, email')
              .eq('id', orderData.user_id)
              .single();
            
            if (!clientError && clientData) {
              clientResult = { data: clientData, error: null };
            } else {
              clientResult = { data: { name: 'Unknown User', email: 'unknown@example.com' }, error: null };
            }
          }
        } catch (err) {
          clientResult = { data: { name: 'Unknown User', email: 'unknown@example.com' }, error: null };
        }

        if (orderData.company_id) {
          try {
            const { data: companyData, error: companyError } = await supabase
              .from('companies')
              .select(`
                company_name,
                netsuite_number,
                ship_to,
                support_fund:support_fund_levels(percent),
                subsidiary:subsidiaries(name, ship_from_address, company_address, phone, email),
                class:classes(name),
                location:Locations(location_name),
                incoterm:incoterms(name),
                payment_term:payment_terms(name)
              `)
              .eq('id', orderData.company_id)
              .single();
            
            companyResult = { data: companyData, error: companyError };
          } catch (err) {
          }
        }

        // Combine data
        const combinedOrder = {
          ...orderData,
          client: clientResult.data,
          company: companyResult.data
        };

        setOrder(combinedOrder);
        setOriginalStatus(orderData.status || '');
        setAdminInvoiceNumber(orderData.invoice_number || '');
        setAdminSoNumber(orderData.so_number || '');
        setAdminNumberOfPallets(orderData.number_of_pallets?.toString() || '');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      // Loading handled by AdminLayout
    }
  };

  const fetchOrderItems = async () => {
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          product:Products(item_name, sku, price_international, price_americas, qualifies_for_credit_earning, case_pack, case_weight, hs_code, made_in)
        `)
        .eq('order_id', orderId)
        .order('is_support_fund_item', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true });

      if (error) throw error;
      setOrderItems(data || []);
    } catch (err: any) {
      console.error('Error fetching order items:', err);
    }
  };

  const fetchOrderHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('order_history')
        .select('*')
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (error) {
        // Handle missing table gracefully
        if (error.code === 'PGRST205') {
          console.log('Order history table not found, skipping...');
          setOrderHistory([]);
          return;
        }
        throw error;
      }
      setOrderHistory(data || []);
    } catch (err: any) {
      console.error('Error fetching order history:', err);
      setOrderHistory([]); // Set empty array on error
    }
  };

  // Validation function to check required fields based on status
  const validateRequiredFields = (status: string) => {
    const errors = [];
    
    if (status === 'In Process' || status === 'Ready' || status === 'Done') {
      if (!adminSoNumber || adminSoNumber.trim() === '') {
        errors.push('so_number');
      }
    }
    
    if (status === 'Ready' || status === 'Done') {
      if (!adminInvoiceNumber || adminInvoiceNumber.trim() === '') {
        errors.push('invoice_number');
      }
      if (!adminNumberOfPallets || adminNumberOfPallets.trim() === '') {
        errors.push('number_of_pallets');
      }
    }
    
    return errors;
  };

  // Admin-specific functions
  const handleSaveAdminOrderRefs = async () => {
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
          number_of_pallets: numberOfPallets
        })
        .eq('id', orderId);
      if (error) throw error;
      setOrder(prev => prev ? { 
        ...prev, 
        invoice_number: adminInvoiceNumber || null, 
        so_number: adminSoNumber || null,
        number_of_pallets: numberOfPallets
      } as Order : prev);
      
      // Update original status to reflect the saved status
      setOriginalStatus(order.status);
      
      // Add history entry for status change if status changed
      if (oldStatus !== order.status) {
        await addHistoryEntry(
          'status_change',
          oldStatus,
          order.status,
          `Status changed from ${oldStatus} to ${order.status}`
        );
        
        // Send automatic email notification for specific status changes
        try {
          let emailType = null;
          if (order.status === 'In Process') {
            emailType = 'in_process';
          } else if (order.status === 'Ready') {
            emailType = 'ready';
          } else if (order.status === 'Cancelled') {
            emailType = 'cancelled';
          }

          if (emailType) {
            await fetch('/api/orders/send-email', {
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
  };

  const handleReorderProducts = async (newOrder: OrderItem[]) => {
    try {
      // Update sort_order for each item
      const updates = newOrder.map((item, index) => 
        supabase
          .from('order_items')
          .update({ sort_order: index })
          .eq('id', item.id)
      );

      await Promise.all(updates);
      
      // Refresh order items
      await fetchOrderItems();
      
    } catch (err: any) {
      console.error('Error reordering products:', err);
      setError('Failed to reorder products. Please try again.');
    }
  };

  const moveItem = (fromIndex: number, toIndex: number) => {
    const newItems = [...orderItems];
    const [movedItem] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, movedItem);
    setOrderItems(newItems);
    return newItems;
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    setDraggedItem(itemId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetItemId: string) => {
    e.preventDefault();
    
    if (!draggedItem || draggedItem === targetItemId) {
      setDraggedItem(null);
      return;
    }

    const fromIndex = orderItems.findIndex(item => item.id === draggedItem);
    const toIndex = orderItems.findIndex(item => item.id === targetItemId);

    if (fromIndex !== -1 && toIndex !== -1) {
      const newOrder = moveItem(fromIndex, toIndex);
      handleReorderProducts(newOrder);
    }

    setDraggedItem(null);
  };


  // Create packing slip automatically when status changes to Ready
  const createAutomaticPackingSlip = async () => {
    if (!order) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No user found');

      // Create packing slip with saved order data
      const packingSlipData = {
        order_id: order.id,
        invoice_number: order.invoice_number || '',
        shipping_method: '', // Default empty, admin can fill later
        netsuite_reference: order.so_number || '',
        notes: '',
        contact_name: '',
        contact_email: '',
        contact_phone: '',
        vat_number: '',
        created_by: user.id
      };

      const { error } = await supabase
        .from('packing_slips')
        .insert(packingSlipData);

      if (error) throw error;

      // Update order to mark packing slip as generated
      const { error: updateError } = await supabase
        .from('orders')
        .update({ 
          packing_slip_generated: true,
          packing_slip_generated_at: new Date().toISOString(),
          packing_slip_generated_by: user.id
        })
        .eq('id', order.id);

      if (updateError) throw updateError;

      // Update local state
      setOrder(prev => prev ? {
        ...prev,
        packing_slip_generated: true,
        packing_slip_generated_at: new Date().toISOString(),
        packing_slip_generated_by: user.id
      } : null);

      console.log('Packing slip created automatically');
    } catch (err: any) {
      console.error('Error creating automatic packing slip:', err);
      // Don't throw error - status change should still succeed even if packing slip creation fails
    }
  };

  const handleStatusChange = (newStatus: string) => {
    if (!order) return;
    
    // Only allow status changes when in edit mode
    if (!editOrderInfoMode) {
      return;
    }

    // Only update local state - don't save to database until Save button is clicked
    setOrder(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const sendNotification = async (type: string, customMessage?: string) => {
    if (!order) return;
    
    setSendingNotification(true);
    try {
      const response = await fetch('/api/orders/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId: order.id,
          type,
          customMessage
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh history to show notification sent
        if (role === 'admin') {
          fetchOrderHistory();
        }
      } else {
        console.error('Failed to send notification:', data.error);
      }
    } catch (err: any) {
      console.error('Error sending notification:', err);
    } finally {
      setSendingNotification(false);
    }
  };

  const handleSendCustomEmail = async () => {
    if (!order) return;
    
    setSendingNotification(true);
    try {
      const response = await fetch('/api/orders/send-email', {
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
        alert('Email sent successfully!');
      } else {
        alert(`Failed to send email: ${data.error}`);
      }
    } catch (err: any) {
      alert(`Error sending email: ${err.message}`);
    } finally {
      setSendingNotification(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      // admin-only action
      if (role !== 'admin') return;
      const { generateNetSuiteCSV, downloadCSV } = await import('../../../lib/csvExport');
      const { data: orderData, error } = await supabase
        .from('orders')
        .select(`
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
        `)
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
      alert('Failed to export CSV.');
    }
  };

  const handleDeleteOrder = async () => {
    // Use originalStatus (saved status) to check deletion eligibility
    if (originalStatus !== 'Cancelled' && originalStatus !== 'Draft') {
      alert('Only Cancelled or Draft orders can be deleted.');
      return;
    }

    // Only admins can delete Cancelled orders; both can delete Draft
    if (originalStatus === 'Cancelled' && role !== 'admin') {
      alert('Only admins can delete cancelled orders.');
      return;
    }

    const confirmMessage = `Are you sure you want to delete this ${originalStatus} order? This action cannot be undone.`;
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      setSaving(true);
      
      const response = await fetch(`/api/orders/delete?orderId=${orderId}&userRole=${role}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete order');
      }

      alert('Order deleted successfully');
      // Redirect to orders list
      window.location.href = backUrl;
    } catch (err: any) {
      console.error('Error deleting order:', err);
      alert(err.message || 'Failed to delete order');
    } finally {
      setSaving(false);
    }
  };


  // Let AdminLayout handle loading - no need for separate loading state here

  // Handle loading state - show nothing while data loads (AdminLayout handles main loading)
  if (!order && !error) {
    return null;
  }

  if (error || !order) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Order Not Found</h1>
        <p className="text-gray-600 mb-4">{error || 'The order you are looking for does not exist.'}</p>
        <Link
          href={backUrl}
          className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
        >
          Back to Orders
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {role === 'admin' ? 'Order Details' : 'Order Summary'}
          </h1>
          {order?.company?.company_name && (
            <h2 className="text-lg font-medium text-gray-700 mt-1">{order.company.company_name}</h2>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {/* Client: Edit Order button (only if status is Open) */}
          {role === 'client' && order?.status === 'Open' && (
            <Link
              href={editUrl}
              className="bg-black text-white px-4 py-2 hover:opacity-90 transition text-sm"
            >
              Edit Order
            </Link>
          )}
          
          {/* Admin: Edit Order button (always available) */}
          {role === 'admin' && (
            <Link
              href={editUrl}
              className="bg-black text-white px-4 py-2 hover:opacity-90 transition text-sm"
            >
              Edit Order
            </Link>
          )}
          
          {/* Admin: Send Update button */}
          {role === 'admin' && (
            <button
              onClick={() => setShowSendEmailModal(true)}
              disabled={sendingNotification}
              className="bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 transition disabled:opacity-50 text-sm"
            >
              Send Update
            </button>
          )}
          
          {/* Admin: Download CSV button */}
          {role === 'admin' && (
            <button
              onClick={handleDownloadCSV}
              className="bg-green-600 text-white px-4 py-2 hover:bg-green-700 transition text-sm"
            >
              Download CSV
            </button>
          )}
          
          {/* Delete button for Cancelled orders (Admin only) or Draft orders (Both) */}
          {/* Use originalStatus (saved status) instead of order.status (UI state) */}
          {((role === 'admin' && originalStatus === 'Cancelled') || originalStatus === 'Draft') && (
            <button
              onClick={handleDeleteOrder}
              disabled={saving}
              className="bg-red-600 text-white px-4 py-2 hover:bg-red-700 transition disabled:opacity-50 text-sm"
            >
              {saving ? 'Deleting...' : 'Delete Order'}
            </button>
          )}
          
          {/* Packing Slip functionality (both roles) */}
          {(['Ready', 'Done'].includes(originalStatus || '')) && (
            order?.packing_slip_generated ? (
              <Link
                href={packingSlipUrl}
                className="px-4 py-2 transition text-sm bg-gray-600 text-white hover:bg-gray-700"
              >
                Packing Slip
              </Link>
            ) : (
              <button
                onClick={() => setShowPackingSlipForm(true)}
                className="px-4 py-2 transition text-sm bg-purple-600 text-white hover:bg-purple-700"
              >
                Create Packing Slip
              </button>
            )
          )}
          
          <Link
            href={backUrl}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Orders
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-6">
        {/* Left Block: Order Information */}
        <Card header={<h2 className="font-semibold">Order Information</h2>}>
          <div className="px-6 space-y-2">
            <div className={role === 'admin' ? 'grid grid-cols-2 gap-4' : ''}>
              <div>
                <label className="text-sm font-medium text-gray-500">PO Number</label>
                <p className="text-lg font-mono">{order.po_number || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="mt-1">
                  {role === 'admin' ? (
                    <select
                      value={order.status}
                      onChange={(e) => handleStatusChange(e.target.value)}
                      disabled={!editOrderInfoMode}
                      className={`px-3 py-1 border border-[#e5e5e5] rounded text-sm ${
                        !editOrderInfoMode 
                          ? 'bg-gray-100 text-gray-600 cursor-not-allowed'
                          : order.status === 'Open'
                          ? 'bg-gray-200 text-gray-800'
                          : order.status === 'In Process'
                          ? 'bg-blue-100 text-blue-800'
                          : order.status === 'Ready'
                          ? 'bg-orange-100 text-orange-800'
                          : order.status === 'Done'
                          ? 'bg-green-100 text-green-800'
                          : order.status === 'Cancelled'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {statusOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <OrderStatusBadge status={order.status} />
                  )}
                </div>
              </div>
            </div>
            
            {/* Admin-only: Invoice/SO Numbers */}
            {role === 'admin' && (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-gray-500">Invoice Number</label>
                  <input
                    type="text"
                    value={adminInvoiceNumber}
                    onChange={(e) => setAdminInvoiceNumber(e.target.value)}
                    disabled={!editOrderInfoMode}
                    className={`mt-1 w-full px-3 py-2 border text-sm ${
                      !editOrderInfoMode 
                        ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : validateRequiredFields(order?.status || '').includes('invoice_number')
                        ? 'border-red-500 bg-red-50'
                        : 'border-[#e5e5e5]'
                    }`}
                    placeholder="Enter invoice number"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">SO Number</label>
                  <input
                    type="text"
                    value={adminSoNumber}
                    onChange={(e) => setAdminSoNumber(e.target.value)}
                    disabled={!editOrderInfoMode}
                    className={`mt-1 w-full px-3 py-2 border text-sm ${
                      !editOrderInfoMode 
                        ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : validateRequiredFields(order?.status || '').includes('so_number')
                        ? 'border-red-500 bg-red-50'
                        : 'border-[#e5e5e5]'
                    }`}
                    placeholder="Enter SO number"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Number of Pallets</label>
                  <input
                    type="number"
                    min="1"
                    value={adminNumberOfPallets}
                    onChange={(e) => setAdminNumberOfPallets(e.target.value)}
                    disabled={!editOrderInfoMode}
                    className={`mt-1 w-full px-3 py-2 border text-sm ${
                      !editOrderInfoMode 
                        ? 'border-gray-200 bg-gray-100 text-gray-600 cursor-not-allowed'
                        : validateRequiredFields(order?.status || '').includes('number_of_pallets')
                        ? 'border-red-500 bg-red-50'
                        : 'border-[#e5e5e5]'
                    }`}
                    placeholder="Enter number of pallets"
                  />
                </div>
              </div>
            )}
            
            {/* Edit/Save/Cancel Buttons */}
            {role === 'admin' && (
              <div className="flex justify-end gap-2 pt-2">
                {editOrderInfoMode && (
                  <button
                    onClick={() => {
                      setEditOrderInfoMode(false);
                      // Reset form fields to original values
                      setAdminInvoiceNumber(order?.invoice_number || '');
                      setAdminSoNumber(order?.so_number || '');
                      setAdminNumberOfPallets(order?.number_of_pallets?.toString() || '');
                      // Reset status to original value
                      setOrder(prev => prev ? { ...prev, status: originalStatus } : null);
                    }}
                    className="px-3 py-1.5 bg-gray-300 text-gray-700 text-sm hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={editOrderInfoMode ? handleSaveAdminOrderRefs : () => setEditOrderInfoMode(true)}
                  disabled={savingAdminFields}
                  className="px-3 py-1.5 bg-black text-white text-sm hover:opacity-90 disabled:opacity-50"
                >
                  {savingAdminFields ? 'Saving…' : editOrderInfoMode ? 'Save' : 'Edit'}
                </button>
              </div>
            )}
            
            
            <div>
              <label className="text-sm font-medium text-gray-500">Created</label>
              <p className="text-sm text-gray-600">
                {new Date(order.created_at).toLocaleString()}
                {currentUserName && ` by ${currentUserName}`}
              </p>
            </div>
          </div>
        </Card>

        {/* Middle Block: Bill To */}
        <Card header={<h2 className="font-semibold">Bill To</h2>}>
          <div className="px-6 space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-500">Company</label>
              <p className="text-lg">
                {role === 'admin' && order.company?.netsuite_number && `[${order.company.netsuite_number}] `}
                {order.company?.company_name || 'N/A'}
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Ship To</label>
              <div className="text-sm text-gray-700 whitespace-pre-line">
                {order.company?.ship_to || 'Not specified'}
              </div>
            </div>
          </div>
        </Card>

        {/* Right Block: Order Summary */}
        <Card header={<h2 className="font-semibold">Order Summary</h2>}>
          <div className="px-6 space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-500">Total Order</label>
              <p className="text-lg font-semibold">{formatCurrency(order.total_value)}</p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-500">Credit Earned</label>
              <p className="text-lg text-green-600 font-semibold">
                {formatCurrency(order.credit_earned)}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Incoterm</label>
                <p className="text-sm text-gray-600">{order.company?.incoterm?.name || 'Not specified'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Payment Terms</label>
                <p className="text-sm text-gray-600">{order.company?.payment_term?.name || 'Not specified'}</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Order Items */}
      <Card header={
        <div className="flex justify-between items-center">
          <h2 className="font-semibold">Items</h2>
          {role === 'admin' && (
            <div className="flex items-center space-x-4">
              {isReordering && (
                <span className="text-sm text-blue-600 font-medium">
                  Drag and drop rows to reorder products
                </span>
              )}
              <button
                onClick={() => setIsReordering(!isReordering)}
                className={`px-3 py-1.5 text-sm font-medium rounded transition ${
                  isReordering 
                    ? 'bg-green-600 text-white hover:bg-green-700' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {isReordering ? 'Done Reordering' : 'Reorder Products'}
              </button>
            </div>
          )}
        </div>
      }>
        <div className="px-6 overflow-x-auto">
          <table className="min-w-full border border-[#e5e5e5] rounded-lg overflow-hidden">
            <thead>
              <tr className="border-b border-[#e5e5e5]">
                {role === 'admin' && isReordering && (
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-600 uppercase tracking-wider w-12">
                    Order
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Product</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">SKU</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Quantity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Cases</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Unit Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Price</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, index) => (
                <tr
                  key={item.id} 
                  className={`hover:bg-gray-50 border-b border-[#e5e5e5] ${item.is_support_fund_item ? 'bg-green-50' : ''} ${
                    role === 'admin' && isReordering ? 'cursor-move' : ''
                  } ${draggedItem === item.id ? 'opacity-50' : ''}`}
                  draggable={role === 'admin' && isReordering}
                  onDragStart={role === 'admin' ? (e) => handleDragStart(e, item.id) : undefined}
                  onDragOver={role === 'admin' ? handleDragOver : undefined}
                  onDrop={role === 'admin' ? (e) => handleDrop(e, item.id) : undefined}
                >
                  {role === 'admin' && isReordering && (
                    <td className="px-3 py-4 text-center">
                      <div className="flex items-center justify-center">
                        <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M7 2a1 1 0 011 1v2h4V3a1 1 0 112 0v2h2a1 1 0 110 2h-2v4h2a1 1 0 110 2h-2v2a1 1 0 11-2 0v-2H8v2a1 1 0 11-2 0v-2H4a1 1 0 110-2h2V7H4a1 1 0 110-2h2V3a1 1 0 011-1z"/>
                        </svg>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-medium text-gray-900">
                        {item.product?.item_name || 'N/A'}
                      </div>
                      {item.is_support_fund_item && (
                        <span className="inline-flex items-center rounded px-2 py-1 text-xs font-medium bg-green-100 text-green-800">Support Fund</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{item.product?.sku || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatQuantity(item.quantity)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">{formatQuantity(item.case_qty || 0)}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-sm ${item.is_support_fund_item ? 'text-green-700 font-medium' : 'text-gray-900'}`}>{formatCurrency(item.unit_price)}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${item.is_support_fund_item ? 'text-green-700' : 'text-gray-900'}`}>{formatCurrency(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {orderItems.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <p>No items found for this order.</p>
            {role === 'client' && order?.status === 'Open' && (
              <p className="text-sm mt-2">
                <Link
                  href={editUrl}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Edit this order
                </Link>
                {' '}to add items.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Order Totals */}
      <Card header={<h2 className="font-semibold">Totals</h2>}>
        <div className="px-6 space-y-1">
          {(() => {
            // Calculate breakdown
            const regularItems = orderItems.filter(item => !item.is_support_fund_item);
            const supportFundItems = orderItems.filter(item => item.is_support_fund_item);
            const regularSubtotal = regularItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
            const supportFundItemsTotal = supportFundItems.reduce((sum, item) => sum + (item.total_price || 0), 0);
            
            // Use database values instead of recalculating
            const creditUsed = order.support_fund_used || 0;
            const totalOrderValue = order.total_value || 0;
            
            // Only calculate the balance
            const balance = creditUsed - supportFundItemsTotal;
            
            return (
              <>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Regular Items:</span>
                  <span className="text-sm font-medium">{formatCurrency(regularSubtotal)}</span>
                </div>

                <div className="flex justify-between text-green-600">
                  <span className="text-sm">Credit Used:</span>
                  <span className="text-sm font-medium">{formatCurrency(creditUsed)}</span>
                </div>

                <div className="flex justify-between text-orange-600">
                  <span className="text-sm">Balance:</span>
                  <span className="text-sm font-medium">{formatCurrency(balance)}</span>
                </div>

                <div className="border-t pt-2">
                  <div className="flex justify-between">
                    <span className="text-lg font-semibold">Total Order Value:</span>
                    <span className="text-lg font-semibold">{formatCurrency(totalOrderValue)}</span>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </Card>

      {/* Packing Slip Form Modal */}
      {showPackingSlipForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-lg font-semibold text-gray-900 font-sans">
                  Create Packing Slip
                </h2>
                <button
                  onClick={() => setShowPackingSlipForm(false)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Invoice Number</label>
                  <input
                    type="text"
                    value={packingSlipData.invoice_number}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, invoice_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    placeholder="Enter invoice number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Shipping Method</label>
                  <select
                    value={packingSlipData.shipping_method}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, shipping_method: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                  >
                    <option value="">Select shipping method</option>
                    <option value="Air">Air</option>
                    <option value="Ocean">Ocean</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">QIQI Sales Order</label>
                  <input
                    type="text"
                    value={packingSlipData.netsuite_reference}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, netsuite_reference: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    placeholder="Enter QIQI sales order reference"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Contact Name</label>
                  <input
                    type="text"
                    value={packingSlipData.contact_name}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, contact_name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    placeholder="Enter contact name"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Contact Email</label>
                  <input
                    type="email"
                    value={packingSlipData.contact_email}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, contact_email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    placeholder="Enter contact email"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Contact Phone Number</label>
                  <input
                    type="text"
                    value={packingSlipData.contact_phone}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, contact_phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    placeholder="Enter contact phone number"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">VAT #</label>
                  <input
                    type="text"
                    value={packingSlipData.vat_number}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, vat_number: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black font-sans text-sm"
                    placeholder="Enter VAT number"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2 font-sans">Notes</label>
                  <textarea
                    value={packingSlipData.notes}
                    onChange={(e) => setPackingSlipData(prev => ({ ...prev, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black h-24 font-sans text-sm"
                    placeholder="Enter any additional notes for the packing slip"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowPackingSlipForm(false)}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded transition hover:bg-gray-200 focus:ring-2 focus:ring-gray-300 font-sans text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreatePackingSlip}
                  disabled={saving}
                  className="flex-1 bg-black text-white px-4 py-2 rounded transition hover:opacity-90 focus:ring-2 focus:ring-gray-900 disabled:opacity-50 disabled:cursor-not-allowed font-sans text-sm"
                >
                  {saving ? 'Creating...' : 'Create Packing Slip'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Order Documents Section */}
      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900 font-sans">Documents</h2>
          {role === 'admin' && (
            <OrderDocumentUpload 
              orderId={orderId} 
              onUploadComplete={handleDocumentUploadComplete}
            />
          )}
        </div>
        <OrderDocumentsView 
          key={documentsRefreshKey}
          orderId={orderId} 
          role={role}
        />
      </div>

      {/* Order History Section */}
      <div className="mt-8">
        <OrderHistoryView orderId={orderId} role={role} />
      </div>

      {/* Send Email Modal */}
      {showSendEmailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">
                Send Order Update Email
              </h3>
              
              <p className="text-sm text-gray-600 mb-4">
                Send a custom email notification to the customer about this order.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Message (Optional)
                </label>
                <textarea
                  value={customEmailMessage}
                  onChange={(e) => setCustomEmailMessage(e.target.value)}
                  placeholder="Enter a custom message to include in the email..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This message will be included in the email along with order details.
                </p>
              </div>

              <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mb-4">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Email Preview:</h4>
                <div className="text-xs text-gray-600 space-y-1">
                  <p><strong>To:</strong> {order?.client?.email || 'Customer'}</p>
                  <p><strong>Subject:</strong> Order Update - #{order?.po_number || order?.id.substring(0, 8)}</p>
                  <p><strong>Order Status:</strong> {order?.status}</p>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowSendEmailModal(false);
                    setCustomEmailMessage('');
                  }}
                  disabled={sendingNotification}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendCustomEmail}
                  disabled={sendingNotification}
                  className="flex-1 px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {sendingNotification ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
