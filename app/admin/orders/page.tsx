"use client";

import OrdersListView from '../../components/shared/OrdersListView';

export default function OrdersPage() {
  return (
    <OrdersListView
        role="admin"
        newOrderUrl="/admin/orders/new"
        viewOrderUrl={(id) => `/admin/orders/${id}`}
      />
  );
}
