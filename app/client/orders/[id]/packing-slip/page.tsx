'use client';

import { useParams } from 'next/navigation';
import ClientLayout from '../../../../components/ClientLayout';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function ClientPackingSlipViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <ClientLayout>
      <PackingSlipView
        role="client"
        backUrl={`/client/orders/${orderId}`}
      />
    </ClientLayout>
  );
}