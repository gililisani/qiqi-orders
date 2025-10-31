'use client';

import AdminLayoutWrapper from '../../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../../config/admin-routes';
import OrderFormView from '../../../components/shared/OrderFormView';

export default function AdminNewOrderPage() {
  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <OrderFormView
        role="admin"
        orderId={null}
        backUrl="/admin/orders"
      />
    </AdminLayoutWrapper>
  );
}
