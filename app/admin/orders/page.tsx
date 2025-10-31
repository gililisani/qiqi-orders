"use client";

import AdminLayoutWrapper from '../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../config/admin-routes';
import OrdersListView from '../../components/shared/OrdersListView';

export default function OrdersPage() {
  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <OrdersListView
        role="admin"
        newOrderUrl="/admin/orders/new"
        viewOrderUrl={(id) => `/admin/orders/${id}`}
      />
    </AdminLayoutWrapper>
  );
}
