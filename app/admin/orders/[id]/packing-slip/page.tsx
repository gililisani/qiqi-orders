'use client';

import { useParams } from 'next/navigation';
import AdminLayoutWrapper from '../../../../components/template/AdminLayoutWrapper';
import { adminRoutes } from '../../../../config/admin-routes';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function AdminPackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <AdminLayoutWrapper routes={adminRoutes}>
      <PackingSlipView
        role="admin"
        backUrl={`/admin/orders/${orderId}`}
      />
    </AdminLayoutWrapper>
  );
}