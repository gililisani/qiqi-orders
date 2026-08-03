'use client';

import { useParams } from 'next/navigation';
import { SLIDocumentView } from '../../../../components/shared/SLIDocumentView';

export default function ClientOrderSLIPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <SLIDocumentView
      dataUrl={`/api/orders/${orderId}/sli/data`}
      backUrl={`/client/orders/${orderId}`}
      backLabel="Back to order"
    />
  );
}
