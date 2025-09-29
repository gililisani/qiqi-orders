'use client';

import { useParams } from 'next/navigation';
import ClientLayout from '../../../components/ClientLayout';
import OrderDetailsView from '../../../components/shared/OrderDetailsView';

export default function ClientOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <ClientLayout>
      <OrderDetailsView
        role="client"
        orderId={orderId}
        backUrl="/client/orders"
        editUrl={`/client/orders/${orderId}/edit`}
        packingSlipUrl={`/client/orders/${orderId}/packing-slip`}
      />
    </ClientLayout>
  );
}