'use client';

import { useParams } from 'next/navigation';
import OrderFormView from '../../../../components/shared/OrderFormView';

export default function ClientEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <OrderFormView
        role="client"
        orderId={orderId}
        backUrl={`/client/orders/${orderId}`}
      />
  );
}
