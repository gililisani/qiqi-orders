'use client';

import { useParams } from 'next/navigation';
import ClientOrderDetailsView from '../../../components/client/ClientOrderDetailsView';

export default function ClientOrderViewPage() {
  const params = useParams();
  const orderId = params.id as string;
  return <ClientOrderDetailsView orderId={orderId} />;
}
