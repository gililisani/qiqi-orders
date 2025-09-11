'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund_id: string;
  subsidiary_id: string;
  class_id: string;
  location_id: string;
  created_at: string;
  // Related data
  support_fund?: { percent: number };
  subsidiary?: { name: string };
  class?: { name: string };
  location?: { name: string };
  user_count?: number;
  order_count?: number;
  last_login?: string;
}

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          *,
          support_fund:support_fund_levels(percent),
          subsidiary:subsidiaries(name),
          class:classes(name),
          location:Locations(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get user counts and order counts for each company
      const companiesWithCounts = await Promise.all(
        (data || []).map(async (company) => {
          const [userCount, orderCount] = await Promise.all([
            supabase
              .from('users')
              .select('id', { count: 'exact' })
              .eq('company_id', company.id),
            supabase
              .from('orders')
              .select('id', { count: 'exact' })
              .eq('company_id', company.id)
          ]);

          return {
            ...company,
            user_count: userCount.count || 0,
            order_count: orderCount.count || 0
          };
        })
      );

      setCompanies(companiesWithCounts);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this company? This will also delete all associated users and orders.')) return;

    try {
      const { error } = await supabase
        .from('companies')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchCompanies(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  const filteredCompanies = companies.filter(company =>
    company.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.netsuite_number?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading companies...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Companies Management</h1>
          <Link
            href="/admin/companies/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Company
          </Link>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search companies by name or NS number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-4 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black"
          />
        </div>

        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <ul className="divide-y divide-gray-200">
            {filteredCompanies.map((company) => (
              <li key={company.id}>
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">
                          {company.company_name || 'Unnamed Company'}
                        </h3>
                        <p className="text-sm text-gray-500">
                          NS Number: {company.netsuite_number || 'N/A'}
                        </p>
                        <div className="mt-2 flex space-x-4 text-sm text-gray-500">
                          <span>Support Fund: {company.support_fund?.percent || 0}%</span>
                          <span>Users: {company.user_count || 0}</span>
                          <span>Orders: {company.order_count || 0}</span>
                          <span>Location: {company.location?.name || 'N/A'}</span>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <Link
                          href={`/admin/companies/${company.id}`}
                          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                        >
                          View
                        </Link>
                        <Link
                          href={`/admin/companies/${company.id}/edit`}
                          className="text-green-600 hover:text-green-800 text-sm font-medium"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(company.id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {filteredCompanies.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500">
              {searchTerm ? 'No companies found matching your search.' : 'No companies found.'}
            </p>
            <Link
              href="/admin/companies/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add Your First Company
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
