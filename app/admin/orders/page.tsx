"use client";

import AdminLayout from '../../components/AdminLayout';
import OrdersListView from '../../components/shared/OrdersListView';

export default function OrdersPage() {
  return (
    <AdminLayout>
      <OrdersListView
        role="admin"
        newOrderUrl="/admin/orders/new"
        viewOrderUrl={(id) => `/admin/orders/${id}`}
      />
    </AdminLayout>
  );
}
