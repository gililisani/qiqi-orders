'use client';

import ClientLayout from '../components/ClientLayout';

export default function ClientDashboard() {
  return (
    <ClientLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Client Dashboard</h1>
        <p>This is where clients will create and view their orders.</p>
      </div>
    </ClientLayout>
  );
}
