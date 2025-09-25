"use client";

import ClientLayout from '../../components/ClientLayout';
import OrdersListView from '../../components/shared/OrdersListView';

export default function ClientOrdersPage() {
  return (
    <ClientLayout>
      <OrdersListView
        role="client"
        newOrderUrl="/client/orders/new"
        viewOrderUrl={(id) => `/client/orders/${id}`}
      />
    </ClientLayout>
  );
}
