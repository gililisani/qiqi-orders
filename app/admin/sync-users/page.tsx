'use client';

import { useState } from 'react';
import InnerPageShell from '../../components/ui/InnerPageShell';
import Link from 'next/link';

interface SyncData {
  summary: {
    totalAuthUsers: number;
    totalClients: number;
    orphanedAuthUsers: number;
    missingAuthUsers: number;
  };
  orphanedAuthUsers: Array<{
    id: string;
    email: string;
    createdAt: string;
  }>;
  missingAuthClients: Array<{
    id: string;
    email: string;
    name: string;
    company_id: string;
  }>;
  missingAuthAdmins: Array<{
    id: string;
    email: string;
    name: string;
  }>;
}

export default function SyncUsersPage() {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [data, setData] = useState<SyncData | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const checkSync = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/users/sync-check');
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to check sync');
      }

      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cleanupOrphanedUsers = async () => {
    if (!data || data.orphanedAuthUsers.length === 0) return;
    
    if (!confirm(`Are you sure you want to delete ${data.orphanedAuthUsers.length} orphaned auth user(s)?`)) return;

    setSyncing(true);
    setError('');
    setSuccess('');

    try {
      const userIds = data.orphanedAuthUsers.map(u => u.id);
      
      const response = await fetch('/api/users/sync-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cleanup',
          userIds
        })
      });

      const result = await response.json();

      console.log('Cleanup response:', { status: response.status, result });

      if (!response.ok) {
        throw new Error(result.error || 'Failed to cleanup users');
      }

      // Check if any deletions failed
      if (result.results?.failed && result.results.failed.length > 0) {
        const failedUsers = result.results.failed.map((f: any) => `${f.userId}: ${f.error}`).join(', ');
        setError(`Cleanup partially failed. Failed users: ${failedUsers}`);
      } else {
        setSuccess(result.message || 'Users cleaned up successfully');
      }
      
      // Refresh the check
      setTimeout(() => {
        checkSync();
      }, 1000);

    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="p-6">
        <InnerPageShell
          title="User Sync Check"
          breadcrumbs={[{ label: 'Sync Users' }]}
          actions={
            <Link href="/admin/users" className="text-gray-600 hover:text-gray-800">
              ← Back to Users
            </Link>
          }
        >
          <div className="max-w-4xl space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 mb-2">What This Tool Does:</h3>
              <p className="text-sm text-blue-800">
                This tool checks for mismatches between Supabase Auth users and your clients database.
                It can help clean up orphaned auth users that weren't properly deleted.
              </p>
            </div>

            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
                {success}
              </div>
            )}

            <div className="flex gap-4">
              <button
                onClick={checkSync}
                disabled={loading}
                className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Checking...' : 'Check User Sync'}
              </button>

              {data && data.orphanedAuthUsers.length > 0 && (
                <button
                  onClick={cleanupOrphanedUsers}
                  disabled={syncing}
                  className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition disabled:opacity-50"
                >
                  {syncing ? 'Cleaning Up...' : `Clean Up ${data.orphanedAuthUsers.length} Orphaned User(s)`}
                </button>
              )}
            </div>

            {data && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="bg-white p-6 rounded-lg shadow border">
                  <h2 className="text-lg font-semibold mb-4">Summary</h2>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 p-4 rounded">
                      <div className="text-sm text-gray-600">Auth Users</div>
                      <div className="text-2xl font-bold">{data.summary.totalAuthUsers}</div>
                    </div>
                    <div className="bg-gray-50 p-4 rounded">
                      <div className="text-sm text-gray-600">Client Records</div>
                      <div className="text-2xl font-bold">{data.summary.totalClients}</div>
                    </div>
                    <div className={`p-4 rounded ${data.summary.orphanedAuthUsers > 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                      <div className="text-sm text-gray-600">Orphaned Auth</div>
                      <div className={`text-2xl font-bold ${data.summary.orphanedAuthUsers > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {data.summary.orphanedAuthUsers}
                      </div>
                    </div>
                    <div className={`p-4 rounded ${data.summary.missingAuthUsers > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
                      <div className="text-sm text-gray-600">Missing Auth</div>
                      <div className={`text-2xl font-bold ${data.summary.missingAuthUsers > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {data.summary.missingAuthUsers}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Orphaned Auth Users */}
                {data.orphanedAuthUsers.length > 0 && (
                  <div className="bg-white p-6 rounded-lg shadow border">
                    <h2 className="text-lg font-semibold mb-4 text-red-600">
                      ⚠️ Orphaned Auth Users ({data.orphanedAuthUsers.length})
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                      These users exist in Supabase Auth but have no client record. They should be deleted.
                    </p>
                    <div className="space-y-2">
                      {data.orphanedAuthUsers.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-red-50 rounded border border-red-200">
                          <div>
                            <p className="font-medium text-red-900">{user.email}</p>
                            <p className="text-xs text-red-600">ID: {user.id}</p>
                            <p className="text-xs text-gray-500">Created: {new Date(user.createdAt).toLocaleString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Auth Clients */}
                {data.missingAuthClients && data.missingAuthClients.length > 0 && (
                  <div className="bg-white p-6 rounded-lg shadow border">
                    <h2 className="text-lg font-semibold mb-4 text-yellow-600">
                      ⚠️ Missing Auth Users - Clients ({data.missingAuthClients.length})
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                      These client records exist but have no Supabase Auth user. This is unusual.
                    </p>
                    <div className="space-y-2">
                      {data.missingAuthClients.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded border border-yellow-200">
                          <div>
                            <p className="font-medium text-yellow-900">{user.name}</p>
                            <p className="text-sm text-yellow-700">{user.email}</p>
                            <p className="text-xs text-gray-500">ID: {user.id} | Company: {user.company_id}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing Auth Admins */}
                {data.missingAuthAdmins && data.missingAuthAdmins.length > 0 && (
                  <div className="bg-white p-6 rounded-lg shadow border">
                    <h2 className="text-lg font-semibold mb-4 text-yellow-600">
                      ⚠️ Missing Auth Users - Admins ({data.missingAuthAdmins.length})
                    </h2>
                    <p className="text-sm text-gray-600 mb-4">
                      These admin records exist but have no Supabase Auth user. This is unusual.
                    </p>
                    <div className="space-y-2">
                      {data.missingAuthAdmins.map((user) => (
                        <div key={user.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded border border-yellow-200">
                          <div>
                            <p className="font-medium text-yellow-900">{user.name}</p>
                            <p className="text-sm text-yellow-700">{user.email}</p>
                            <p className="text-xs text-gray-500">ID: {user.id}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All Good */}
                {data.orphanedAuthUsers.length === 0 && 
                 (!data.missingAuthClients || data.missingAuthClients.length === 0) && 
                 (!data.missingAuthAdmins || data.missingAuthAdmins.length === 0) && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
                    <div className="text-4xl mb-2">✅</div>
                    <h3 className="text-lg font-semibold text-green-900 mb-2">All Synced!</h3>
                    <p className="text-sm text-green-700">
                      All Supabase Auth users have matching client records and vice versa.
                    </p>
                  </div>
                )}
              </div>
            )}

            {!data && !loading && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
                <p className="text-gray-600">Click "Check User Sync" to analyze your user database.</p>
              </div>
            )}
          </div>
        </InnerPageShell>
      </div>
  );
}

