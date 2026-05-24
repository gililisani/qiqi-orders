'use client';

import ClientOrderFormView from '../../../components/client/ClientOrderFormView';

export default function ClientNewOrderPage() {
  return <ClientOrderFormView orderId={null} backUrl="/client/orders" />;
}
