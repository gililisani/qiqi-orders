'use client';

import ClientLayout from '../../../components/ClientLayout';
import OrderFormView from '../../../components/shared/OrderFormView';

export default function ClientNewOrderPage() {
  return (
    <ClientLayout>
      <OrderFormView
        role="client"
        orderId={null}
        backUrl="/client/orders"
      />
    </ClientLayout>
  );
}
