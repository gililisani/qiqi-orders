'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
import Link from 'next/link';

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
}

interface User {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  created_at: string;
}

export default function CompanyViewPage() {
  const params = useParams();
  const companyId = params.id as string;
  
  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (companyId) {
      fetchCompany();
      fetchUsers();
    }
  }, [companyId]);

  const fetchCompany = async () => {
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
        .eq('id', companyId)
        .single();

      if (error) throw error;
      setCompany(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('company_id', companyId)
        .order('name', { ascending: true });

      if (error) throw error;
      setUsers(data || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (error) throw error;
      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading company...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !company) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Company Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The company you are looking for does not exist.'}</p>
            <Link
              href="/admin/companies"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Companies
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">{company.company_name}</h1>
          <div className="flex space-x-2">
            <Link
              href={`/admin/companies/${company.id}/edit`}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Edit Company
            </Link>
            <Link
              href="/admin/companies"
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
            >
              Back to Companies
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Company Details */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h2 className="text-lg font-semibold mb-4">Company Details</h2>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Company Name</label>
                <p className="text-lg">{company.company_name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">NetSuite Number</label>
                <p className="text-lg">{company.netsuite_number}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Support Fund</label>
                <p className="text-lg">{company.support_fund?.percent || 0}%</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Subsidiary</label>
                <p className="text-lg">{company.subsidiary?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Class</label>
                <p className="text-lg">{company.class?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Location</label>
                <p className="text-lg">{company.location?.location_name || 'N/A'}</p>
              </div>
            </div>
          </div>

          {/* Users */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Users ({users.length})</h2>
              <Link
                href={`/admin/companies/${company.id}/users/new`}
                className="bg-black text-white px-3 py-1 rounded text-sm hover:opacity-90 transition"
              >
                Add User
              </Link>
            </div>
            
            {users.length > 0 ? (
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        user.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex space-x-1">
                      <Link
                        href={`/admin/companies/${company.id}/users/${user.id}/edit`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>No users found for this company.</p>
                <Link
                  href={`/admin/companies/${company.id}/users/new`}
                  className="mt-2 inline-block bg-black text-white px-3 py-1 rounded text-sm hover:opacity-90 transition"
                >
                  Add First User
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
