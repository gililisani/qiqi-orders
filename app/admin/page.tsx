'use client';

import AdminLayout from '../components/AdminLayout';

export default function AdminDashboard() {

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Products</h2>
            <p className="text-gray-600 mb-4">Manage your product catalog, pricing, and availability.</p>
            <a
              href="/admin/products"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Products
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Companies</h2>
            <p className="text-gray-600 mb-4">Manage distributor companies and their settings.</p>
            <a
              href="/admin/companies"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Companies
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Orders</h2>
            <p className="text-gray-600 mb-4">View and process distributor orders.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Locations</h2>
            <p className="text-gray-600 mb-4">Manage warehouse locations for NetSuite.</p>
            <a
              href="/admin/locations"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Locations
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Users</h2>
            <p className="text-gray-600 mb-4">Manage distributor users for each company.</p>
            <a
              href="/admin/companies"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Users
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Reports</h2>
            <p className="text-gray-600 mb-4">View sales reports and analytics.</p>
            <button
              disabled
              className="bg-gray-300 text-gray-500 px-4 py-2 rounded cursor-not-allowed"
            >
              Coming Soon
            </button>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Support Funds</h2>
            <p className="text-gray-600 mb-4">Manage support fund percentage levels.</p>
            <a
              href="/admin/support-funds"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Support Funds
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Subsidiaries</h2>
            <p className="text-gray-600 mb-4">Manage company subsidiaries.</p>
            <a
              href="/admin/subsidiaries"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Subsidiaries
            </a>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-2">Classes</h2>
            <p className="text-gray-600 mb-4">Manage company classes.</p>
            <a
              href="/admin/classes"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition inline-block"
            >
              Manage Classes
            </a>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
