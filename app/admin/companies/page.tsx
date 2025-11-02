'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabaseClient';
import Link from 'next/link';
import {
  Card,
  CardBody,
  CardHeader,
  Typography,
  Button,
  Chip,
  Breadcrumbs,
} from '../../components/MaterialTailwind';
import { BuildingOfficeIcon, UserGroupIcon, ShoppingCartIcon } from '@heroicons/react/24/outline';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund_id: string;
  subsidiary_id: string;
  class_id: string;
  location_id: string;
  // Related data
  support_fund?: { percent: number };
  subsidiary?: { name: string };
  class?: { name: string };
  location?: { location_name: string };
  user_count?: number;
  order_count?: number;
  last_login?: string;
}

export default function CompaniesPage() {
  const router = useRouter();
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
          location:Locations(location_name)
        `)
        .order('company_name', { ascending: true });

      if (error) throw error;

      // Get user counts and order counts for each company
      const companiesWithCounts = await Promise.all(
        (data || []).map(async (company) => {
          const [userCount, orderCount] = await Promise.all([
            supabase
              .from('clients')
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
      <div className="p-6">
          <p>Loading companies...</p>
        </div>
    );
  }

  return (
    <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Companies Management</h1>
          <div className="flex gap-3">
            <Link
              href="/admin/companies/import"
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Import CSV
            </Link>
            <Link
              href="/admin/companies/new"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add New Company
            </Link>
          </div>
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

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Company
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  NS Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Support Fund
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stats
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Location
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCompanies.map((company) => (
                <tr
                  key={company.id}
                  onClick={() => router.push(`/admin/companies/${company.id}`)}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <BuildingOfficeIcon className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {company.company_name || 'Unnamed Company'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {company.subsidiary?.name || 'No Subsidiary'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.netsuite_number || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {company.support_fund?.percent || 0}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center space-x-3 text-sm text-gray-500">
                      <div className="flex items-center">
                        <UserGroupIcon className="h-4 w-4 mr-1 text-gray-400" />
                        <span>{company.user_count || 0}</span>
                      </div>
                      <div className="flex items-center">
                        <ShoppingCartIcon className="h-4 w-4 mr-1 text-gray-400" />
                        <span>{company.order_count || 0}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {company.location?.location_name || 'N/A'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link
                      href={`/admin/companies/${company.id}/edit`}
                      className="text-black hover:opacity-70 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
  );
}
