'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Client {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  company_id: string;
  created_at: string;
  company?: {
    company_name: string;
    netsuite_number: string;
    support_fund?: { percent: number };
    subsidiary?: { name: string };
    class?: { name: string };
    location?: { location_name: string };
  };
}

export default function UserViewPage() {
  const params = useParams();
  const userId = params.id as string;
  
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userId) {
      fetchClient();
    }
  }, [userId]);

  const fetchClient = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select(`
          *,
          company:companies(
            company_name,
            netsuite_number,
            support_fund:support_fund_levels(percent),
            subsidiary:subsidiaries(name),
            class:classes(name),
            location:Locations(location_name)
          )
        `)
        .eq('id', userId)
        .single();

      if (error) throw error;
      setClient(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!client) return;

    try {
      const { error } = await supabase
        .from('clients')
        .update({ enabled: !client.enabled })
        .eq('id', userId);

      if (error) throw error;
      setClient(prev => prev ? { ...prev, enabled: !prev.enabled } : null);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading user...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error || !client) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">User Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The user you are looking for does not exist.'}</p>
            <Link
              href="/admin/users"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Users
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
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <div className="flex space-x-2">
            <Link
              href={`/admin/users/${client.id}/edit`}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              Edit User
            </Link>
            <Link
              href="/admin/users"
              className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition"
            >
              Back to Users
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* User Details */}
          <Card header={<h2 className="font-semibold">User Details</h2>}>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-500">Full Name</label>
                <p className="text-lg">{client.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email Address</label>
                <p className="text-lg">{client.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Status</label>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-sm ${
                    client.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {client.enabled ? 'Enabled' : 'Disabled'}
                  </span>
                  <button
                    onClick={handleToggleEnabled}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    {client.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">User ID</label>
                <p className="text-sm font-mono text-gray-600">{client.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-lg">{new Date(client.created_at).toLocaleDateString()}</p>
              </div>
            </div>
          </Card>

          {/* Company Details */}
          <Card header={<h2 className="font-semibold">Company Details</h2>}>
            {client.company ? (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Company Name</label>
                  <p className="text-lg">{client.company.company_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">NetSuite Number</label>
                  <p className="text-lg">{client.company.netsuite_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Support Fund</label>
                  <p className="text-lg">{client.company.support_fund?.percent || 0}%</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Subsidiary</label>
                  <p className="text-lg">{client.company.subsidiary?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Class</label>
                  <p className="text-lg">{client.company.class?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Location</label>
                  <p className="text-lg">{client.company.location?.location_name || 'N/A'}</p>
                </div>
                <div className="pt-4">
                  <Link
                    href={`/admin/companies/${client.company_id}`}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    View Full Company Details →
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-gray-500">No company assigned</p>
            )}
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
