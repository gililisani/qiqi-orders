'use client';

import ClientLayout from '../../../../components/ClientLayout';
import PackingSlipView from '../../../../components/shared/PackingSlipView';

export default function ClientPackingSlipViewPage() {
  return (
    <ClientLayout>
      <PackingSlipView
        role="client"
        backUrl="/client/orders"
      />
    </ClientLayout>
  );
}