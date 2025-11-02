'use client';

import { useParams } from 'next/navigation';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function AdminPackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <PackingSlipView
        role="admin"
        backUrl={`/admin/orders/${orderId}`}
      />
  );
}