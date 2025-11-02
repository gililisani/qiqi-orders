'use client';



import OrderFormView from '../../../components/shared/OrderFormView';

export default function AdminNewOrderPage() {
  return (
    <>
      <OrderFormView
        role="admin"
        orderId={null}
        backUrl="/admin/orders"
      />
    </>
  );
}
