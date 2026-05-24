'use client';

import { useParams } from 'next/navigation';
import ClientOrderFormView from '../../../../components/client/ClientOrderFormView';

export default function ClientEditOrderPage() {
  const params = useParams();
  const orderId = params.id as string;
  return <ClientOrderFormView orderId={orderId} backUrl={`/client/orders/${orderId}`} />;
}
