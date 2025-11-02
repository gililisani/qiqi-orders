'use client';

import { useParams } from 'next/navigation';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function ClientPackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <PackingSlipView
        role="client"
        backUrl={`/client/orders/${orderId}`}
      />
  );
}