'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
import Link from 'next/link';

interface FormData {
  name: string;
  email: string;
  enabled: boolean;
  company_id: string;
}

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
}

export default function NewUserPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    enabled: true,
    company_id: ''
  });

  useEffect(() => {
    fetchCompanies();
  }, []);

  const fetchCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('id, company_name, netsuite_number')
        .order('company_name', { ascending: true });

      if (error) throw error;
      setCompanies(data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Generate a secure random password that user will never see
      const randomPassword = Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 32);

      // First, create the user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: formData.email,
        password: randomPassword,
        email_confirm: true,
        user_metadata: {
          full_name: formData.name
        }
      });

      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('A user with this email already exists. Please use a different email.');
        } else {
          throw authError;
        }
        setLoading(false);
        return;
      }

      if (!authData.user) {
        throw new Error('Failed to create user account');
      }

      // Then, create the client profile in our clients table
      const { error: profileError } = await supabase
        .from('clients')
        .insert([{
          id: authData.user.id,
          name: formData.name,
          email: formData.email,
          enabled: formData.enabled,
          company_id: formData.company_id
        }]);

      if (profileError) {
        // If profile creation fails, we should clean up the auth user
        await supabase.auth.admin.deleteUser(authData.user.id);
        throw profileError;
      }

      // Send password reset email so user can set their own password
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        formData.email,
        {
          redirectTo: `${window.location.origin}/confirm-password-reset`
        }
      );

      if (resetError) {
        console.error('Failed to send password reset email:', resetError);
        // Don't fail user creation if email fails - admin can resend
        setError('User created successfully, but failed to send setup email. Please use "Reset Password" to send the setup link.');
      }

      router.push('/admin/users');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Add New User</h1>
          <Link
            href="/admin/users"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Users
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company *
              </label>
              <select
                name="company_id"
                value={formData.company_id}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              >
                <option value="">Select a company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.company_name} ({company.netsuite_number})
                  </option>
                ))}
              </select>
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
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-4">
            <h3 className="text-sm font-medium text-blue-800 mb-2">📧 What happens next:</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• User will receive an email from Qiqi Partners Hub</li>
              <li>• Email contains a secure link to set their password</li>
              <li>• Link expires in 24 hours for security</li>
              <li>• After setting password, they can log in and place orders</li>
              <li>• No temporary password needed - more secure!</li>
            </ul>
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Creating User...' : 'Create User'}
            </button>
            <Link
              href="/admin/users"
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
