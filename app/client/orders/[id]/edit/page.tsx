'use client';

import { useParams } from 'next/navigation';
import ClientLayout from '../../../../components/ClientLayout';
import OrderFormView from '../../../../components/shared/OrderFormView';

export default function ClientEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <ClientLayout>
      <OrderFormView
        role="client"
        orderId={orderId}
        backUrl="/client/orders"
      />
    </ClientLayout>
  );
}
