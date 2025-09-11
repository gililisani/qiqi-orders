'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../../../lib/supabaseClient';
import AdminLayout from '../../../../../../components/AdminLayout';
import Link from 'next/link';

interface FormData {
  name: string;
  email: string;
  enabled: boolean;
  changePassword: boolean;
  newPassword: string;
}

export default function EditUserPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  const userId = params.userId as string;
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<any>(null);
  const [company, setCompany] = useState<any>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    enabled: true,
    changePassword: false,
    newPassword: ''
  });

  useEffect(() => {
    if (userId && companyId) {
      fetchUser();
      fetchCompany();
    }
  }, [userId, companyId]);

  const fetchUser = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', userId)
        .eq('company_id', companyId)
        .single();

      if (error) throw error;

      setUser(data);
      setFormData({
        name: data.name || '',
        email: data.email || '',
        enabled: data.enabled || false,
        changePassword: false,
        newPassword: ''
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchCompany = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('company_name')
        .eq('id', companyId)
        .single();

      if (error) throw error;
      setCompany(data);
    } catch (err: any) {
      console.error('Error fetching company:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Update client profile in our clients table
      const { error: profileError } = await supabase
        .from('clients')
        .update({
          name: formData.name,
          email: formData.email,
          enabled: formData.enabled
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Update user in Supabase Auth if email changed
      if (formData.email !== user.email) {
        const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
          email: formData.email,
          user_metadata: {
            full_name: formData.name
          }
        });

        if (authError) {
          console.error('Error updating auth user:', authError);
          // Don't throw here, profile was updated successfully
        }
      }

      // Update password if requested
      if (formData.changePassword && formData.newPassword) {
        const { error: passwordError } = await supabase.auth.admin.updateUserById(userId, {
          password: formData.newPassword
        });

        if (passwordError) {
          console.error('Error updating password:', passwordError);
          // Don't throw here, other updates were successful
        }
      }

      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;

    try {
      setLoading(true);
      
      // Delete from our clients table first
      const { error: profileError } = await supabase
        .from('clients')
        .delete()
        .eq('id', userId);

      if (profileError) throw profileError;

      // Delete from Supabase Auth
      const { error: authError } = await supabase.auth.admin.deleteUser(userId);
      
      if (authError) {
        console.error('Error deleting auth user:', authError);
        // Don't throw here, profile was deleted successfully
      }

      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading user...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error && !user) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">User Not Found</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <Link
              href={`/admin/companies/${companyId}`}
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Company
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
          <h1 className="text-2xl font-bold">Edit User</h1>
          <Link
            href={`/admin/companies/${companyId}`}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Company
          </Link>
        </div>

        {company && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm text-blue-800">
              <strong>Company:</strong> {company.company_name}
            </p>
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Full Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="enabled"
                checked={formData.enabled}
                onChange={handleChange}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-700">
                User is enabled
              </label>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                name="changePassword"
                checked={formData.changePassword}
                onChange={handleChange}
                className="h-4 w-4 text-black focus:ring-black border-gray-300 rounded"
              />
              <label className="ml-2 block text-sm text-gray-700">
                Change password
              </label>
            </div>
          </div>

          {formData.changePassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                New Password *
              </label>
              <input
                type="password"
                name="newPassword"
                value={formData.newPassword}
                onChange={handleChange}
                required={formData.changePassword}
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
              <p className="text-sm text-gray-500 mt-1">Minimum 6 characters</p>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
            <h3 className="text-sm font-medium text-yellow-800 mb-2">User Information:</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• <strong>Role:</strong> Client</li>
              <li>• <strong>User ID:</strong> {userId}</li>
              <li>• <strong>Created:</strong> {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}</li>
            </ul>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update User'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition disabled:opacity-50"
            >
              Delete User
            </button>
            <Link
              href={`/admin/companies/${companyId}`}
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </AdminLayout>
  );
}
