'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';

interface AssetSubtype {
  id: string;
  name: string;
  slug: string;
  asset_type_id: string;
  asset_type_name: string;
  active: boolean;
  display_order: number;
  asset_count: number;
}

interface AssetType {
  id: string;
  name: string;
  active: boolean;
}

export default function AssetSubtypesPage() {
  const [subtypes, setSubtypes] = useState<AssetSubtype[]>([]);
  const [assetTypes, setAssetTypes] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; slug: string; asset_type_id: string; active: boolean }>({ 
    name: '', slug: '', asset_type_id: '', active: true 
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; slug: string; asset_type_id: string }>({ 
    name: '', slug: '', asset_type_id: '' 
  });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      // Fetch subtypes
      const subtypesResponse = await fetch('/api/admin/asset-subtypes', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!subtypesResponse.ok) {
        const data = await subtypesResponse.json();
        throw new Error(data.error || 'Failed to load asset subtypes');
      }

      const subtypesData = await subtypesResponse.json();
      setSubtypes(subtypesData.assetSubtypes || []);

      // Fetch asset types for dropdown
      const typesResponse = await fetch('/api/admin/asset-types', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (typesResponse.ok) {
        const typesData = await typesResponse.json();
        setAssetTypes(typesData.assetTypes || []);
      }
    } catch (err: any) {
      console.error('Error fetching data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!createForm.name || !createForm.asset_type_id) {
      setError('Name and Asset Type are required');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/asset-subtypes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: createForm.name,
          slug: createForm.slug || createForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
          asset_type_id: createForm.asset_type_id,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create asset subtype');
      }

      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '', asset_type_id: '' });
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create asset subtype');
    }
  };

  const handleEdit = (subtype: AssetSubtype) => {
    setEditingId(subtype.id);
    setEditForm({ 
      name: subtype.name, 
      slug: subtype.slug, 
      asset_type_id: subtype.asset_type_id,
      active: subtype.active 
    });
  };

  const handleSave = async () => {
    if (!editingId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/asset-subtypes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: editingId,
          ...editForm,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update asset subtype');
      }

      setEditingId(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update asset subtype');
    }
  };

  const handleToggleActive = async (subtype: AssetSubtype) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/asset-subtypes', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: subtype.id,
          active: !subtype.active,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update asset subtype');
      }

      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to update asset subtype');
    }
  };

  const handleDelete = async (subtype: AssetSubtype) => {
    if (!confirm(`Delete asset subtype "${subtype.name}"? This will only work if no assets use it.`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/admin/asset-subtypes?id=${subtype.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete asset subtype');
      }

      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to delete asset subtype');
    }
  };

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <p>Loading asset subtypes...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold text-gray-900">Asset Sub-Types Settings</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
        >
          Add New Sub-Type
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Create New Asset Sub-Type</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (optional)</label>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Asset Type</label>
                <select
                  value={createForm.asset_type_id}
                  onChange={(e) => setCreateForm({ ...createForm, asset_type_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                >
                  <option value="">Select Asset Type</option>
                  {assetTypes.filter(t => t.active).map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({ name: '', slug: '', asset_type_id: '' });
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

      <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slug</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Parent Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assets</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {subtypes.map((subtype) => (
              <tr key={subtype.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === subtype.id ? (
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <div className="text-sm font-medium text-gray-900">{subtype.name}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === subtype.id ? (
                    <input
                      type="text"
                      value={editForm.slug}
                      onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    />
                  ) : (
                    <div className="text-sm text-gray-500">{subtype.slug}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {editingId === subtype.id ? (
                    <select
                      value={editForm.asset_type_id}
                      onChange={(e) => setEditForm({ ...editForm, asset_type_id: e.target.value })}
                      className="w-full px-2 py-1 border border-gray-300 rounded"
                    >
                      {assetTypes.filter(t => t.active).map((type) => (
                        <option key={type.id} value={type.id}>{type.name}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="text-sm text-gray-500">{subtype.asset_type_name}</div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 py-1 text-xs rounded-full ${subtype.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                    {subtype.active ? 'Yes' : 'No'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{subtype.asset_count}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {editingId === subtype.id ? (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={handleSave}
                        className="text-green-600 hover:text-green-900"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="text-gray-600 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => handleEdit(subtype)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(subtype)}
                        className={subtype.active ? 'text-yellow-600 hover:text-yellow-900' : 'text-green-600 hover:text-green-900'}
                      >
                        {subtype.active ? 'Deactivate' : 'Activate'}
                      </button>
                      {subtype.asset_count === 0 && (
                        <button
                          onClick={() => handleDelete(subtype)}
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

      {subtypes.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No asset subtypes found.</p>
        </div>
      )}
    </div>
  );
}

