'use client';

import OrderFormView from '../../../components/shared/OrderFormView';

export default function ClientNewOrderPage() {
  return (
    <OrderFormView
        role="client"
        orderId={null}
        backUrl="/client/orders"
      />
  );
}
