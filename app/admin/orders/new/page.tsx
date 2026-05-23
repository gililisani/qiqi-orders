'use client';

import AdminOrderFormView from '../../../components/admin/AdminOrderFormView';

export default function AdminNewOrderPage() {
  return <AdminOrderFormView orderId={null} backUrl="/admin/orders" />;
}
