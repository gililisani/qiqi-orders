"use client";

import OrdersListView from '../../components/shared/OrdersListView';

export default function ClientOrdersPage() {
  return (
    <OrdersListView
        role="client"
        newOrderUrl="/client/orders/new"
        viewOrderUrl={(id) => `/client/orders/${id}`}
      />
  );
}
