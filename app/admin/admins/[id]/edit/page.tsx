'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';


import Link from 'next/link';

interface FormData {
  name: string;
  email: string;
  enabled: boolean;
  changePassword: boolean;
  newPassword: string;
}

export default function EditAdminPage() {
  const params = useParams();
  const router = useRouter();
  const adminId = params.id as string;
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [admin, setAdmin] = useState<any>(null);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    enabled: true,
    changePassword: false,
    newPassword: ''
  });

  useEffect(() => {
    if (adminId) {
      fetchAdmin();
    }
  }, [adminId]);

  const fetchAdmin = async () => {
    try {
      const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('id', adminId)
        .single();

      if (error) throw error;

      setAdmin(data);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Update admin profile in our admins table
      const { error: profileError } = await supabase
        .from('admins')
        .update({
          name: formData.name,
          email: formData.email,
          enabled: formData.enabled
        })
        .eq('id', adminId);

      if (profileError) throw profileError;

      // Update user in Supabase Auth if email changed
      if (formData.email !== admin.email) {
        const { error: authError } = await supabase.auth.admin.updateUserById(adminId, {
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
        const { error: passwordError } = await supabase.auth.admin.updateUserById(adminId, {
          password: formData.newPassword
        });

        if (passwordError) {
          console.error('Error updating password:', passwordError);
          // Don't throw here, other updates were successful
        }
      }

      router.push('/admin/admins');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this admin? This action cannot be undone.')) return;

    try {
      setLoading(true);
      
      // Delete from our admins table first
      const { error: profileError } = await supabase
        .from('admins')
        .delete()
        .eq('id', adminId);

      if (profileError) throw profileError;

      // Delete from Supabase Auth
      const { error: authError } = await supabase.auth.admin.deleteUser(adminId);
      
      if (authError) {
        console.error('Error deleting auth user:', authError);
        // Don't throw here, profile was deleted successfully
      }

      router.push('/admin/admins');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <
        <div className="p-6">
          <p>Loading admin...</p>
        </div>
      </>
    );
  }

  if (error && !admin) {
    return (
      <
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Admin Not Found</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <Link
              href="/admin/admins"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Admins
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Edit Admin</h1>
          <Link
            href="/admin/admins"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Admins
          </Link>
        </div>

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
                Admin is enabled
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
            <h3 className="text-sm font-medium text-yellow-800 mb-2">Admin Information:</h3>
            <ul className="text-sm text-yellow-700 space-y-1">
              <li>• <strong>Role:</strong> Admin</li>
              <li>• <strong>Admin ID:</strong> {adminId}</li>
              <li>• <strong>Created:</strong> {admin?.created_at ? new Date(admin.created_at).toLocaleDateString() : 'Unknown'}</li>
              <li>• <strong>Permissions:</strong> Full system access</li>
            </ul>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Admin'}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={loading}
              className="bg-red-600 text-white px-6 py-2 rounded hover:bg-red-700 transition disabled:opacity-50"
            >
              Delete Admin
            </button>
            <Link
              href="/admin/admins"
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </>
  );
}
