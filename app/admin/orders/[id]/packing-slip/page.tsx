'use client';

import AdminLayout from '../../../../components/AdminLayout';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function AdminPackingSlipViewPage() {
  return (
    <AdminLayout>
      <PackingSlipView
        role="admin"
        backUrl="/admin/orders"
      />
    </AdminLayout>
  );
}