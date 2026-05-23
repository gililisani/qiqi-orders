'use client';

import { useParams } from 'next/navigation';
import AdminOrderFormView from '../../../../components/admin/AdminOrderFormView';

export default function AdminEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;

  return <AdminOrderFormView orderId={orderId} backUrl={`/admin/orders/${orderId}`} />;
}
