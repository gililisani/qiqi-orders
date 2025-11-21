'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';

interface Locale {
  code: string;
  label: string;
  is_default: boolean;
  active: boolean;
  asset_count: number;
}

export default function LocalesPage() {
  const [locales, setLocales] = useState<Locale[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ label: string; active: boolean }>({ label: '', active: true });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{ code: string; label: string }>({ code: '', label: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLocales();
  }, []);

  const fetchLocales = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/locales', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load locales');
      }

      const data = await response.json();
      setLocales(data.locales || []);
    } catch (err: any) {
      console.error('Error fetching locales:', err);
      setError(err.message || 'Failed to load locales');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (locale: Locale) => {
    setEditingCode(locale.code);
    setEditForm({ label: locale.label, active: locale.active });
  };

  const handleSave = async () => {
    if (!editingCode) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/locales', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code: editingCode,
          ...editForm,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update locale');
      }

      setEditingCode(null);
      fetchLocales();
    } catch (err: any) {
      setError(err.message || 'Failed to update locale');
    }
  };

  const handleToggleActive = async (locale: Locale) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/locales', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code: locale.code,
          active: !locale.active,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update locale');
      }

      fetchLocales();
    } catch (err: any) {
      setError(err.message || 'Failed to update locale');
    }
  };

  const handleCreate = async () => {
    if (!createForm.code.trim() || !createForm.label.trim()) {
      setError('Locale code and name are required');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/locales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          code: createForm.code,
          label: createForm.label,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create locale');
      }

      setShowCreateModal(false);
      setCreateForm({ code: '', label: '' });
      fetchLocales();
    } catch (err: any) {
      setError(err.message || 'Failed to create locale');
    }
  };

  const handleDelete = async (locale: Locale) => {
    if (!confirm(`Delete locale "${locale.label}"? This will only work if no assets use it.`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/admin/locales?code=${locale.code}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete locale');
      }

      fetchLocales();
    } catch (err: any) {
      setError(err.message || 'Failed to delete locale');
    }
  };

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <p>Loading locales...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-900">Locales Settings</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
        >
          Add Locale
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Create New Locale</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input
                  type="text"
                  value={createForm.code}
                  onChange={(e) => setCreateForm({ ...createForm, code: e.target.value.toLowerCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="e.g. en, fr, es"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="e.g. English, French, Spanish"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({ code: '', label: '' });
                }}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                className="px-4 py-2 bg-black text-white rounded hover:opacity-90"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Default</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assets</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {locales.map((locale) => (
              <tr key={locale.code} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{locale.code}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingCode === locale.code ? (
                    <input
                      type="text"
                      value={editForm.label}
                      onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <div className="text-sm text-gray-900">{locale.label}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {locale.is_default && (
                    <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">Yes</span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${locale.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {locale.active ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{locale.asset_count}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {editingCode === locale.code ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleSave}
                        className="text-green-600 hover:text-green-900"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingCode(null)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(locale)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(locale)}
                        className={locale.active ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}
                      >
                        {locale.active ? 'Deactivate' : 'Activate'}
                      </button>
                      {locale.asset_count === 0 && (
                        <button
                          onClick={() => handleDelete(locale)}
                          className="text-red-600 hover:text-red-900"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {locales.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No locales found.</p>
        </div>
      )}
    </div>
  );
}

