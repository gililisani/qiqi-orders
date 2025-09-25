'use client';

import AdminLayout from '../../../components/AdminLayout';
import OrderFormView from '../../../components/shared/OrderFormView';

export default function AdminNewOrderPage() {
  return (
    <AdminLayout>
      <OrderFormView
        role="admin"
        orderId={null}
        backUrl="/admin/orders"
      />
    </AdminLayout>
  );
}
