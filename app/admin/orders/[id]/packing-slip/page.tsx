'use client';

import { useAuth } from '../../../../hooks/useAuth';
import AdminLayout from '../../../../components/AdminLayout';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function AdminPackingSlipViewPage() {
  const { loading } = useAuth('Admin');

  return (
    <AdminLayout>
      <PackingSlipView
        role="admin"
        backUrl="/admin/orders"
        parentLoading={loading}
      />
    </AdminLayout>
  );
}