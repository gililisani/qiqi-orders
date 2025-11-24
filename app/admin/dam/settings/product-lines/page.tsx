'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface ProductLine {
  id: string;
  code: string;
  name: string;
  slug: string;
  active: boolean;
  display_order: number;
  asset_count: number;
}

export default function ProductLinesPage() {
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; slug: string; active: boolean }>({ name: '', slug: '', active: true });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; slug: string }>({ name: '', slug: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchProductLines();
  }, []);

  const fetchProductLines = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/admin/product-lines', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load product lines');
      }

      const data = await response.json();
      setProductLines(data.productLines || []);
    } catch (err: any) {
      console.error('Error fetching product lines:', err);
      setError(err.message || 'Failed to load product lines');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (pl: ProductLine) => {
    setEditingId(pl.id);
    setEditForm({ name: pl.name, slug: pl.slug, active: pl.active });
  };

  const handleSave = async () => {
    if (!editingId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/product-lines', {
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
        throw new Error(data.error || 'Failed to update product line');
      }

      setEditingId(null);
      fetchProductLines();
    } catch (err: any) {
      setError(err.message || 'Failed to update product line');
    }
  };

  const handleToggleActive = async (pl: ProductLine) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/product-lines', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: pl.id,
          active: !pl.active,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update product line');
      }

      fetchProductLines();
    } catch (err: any) {
      setError(err.message || 'Failed to update product line');
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      setError('Product line name is required');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/product-lines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: createForm.name,
          slug: createForm.slug || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create product line');
      }

      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '' });
      fetchProductLines();
    } catch (err: any) {
      setError(err.message || 'Failed to create product line');
    }
  };

  const handleDelete = async (pl: ProductLine) => {
    if (!confirm(`Delete product line "${pl.name}"? This will only work if no assets use it.`)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/admin/product-lines?id=${pl.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete product line');
      }

      fetchProductLines();
    } catch (err: any) {
      setError(err.message || 'Failed to delete product line');
    }
  };

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <p className="text-gray-500">Loading product lines...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Product Lines Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Manage product line options for assets</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-black text-white px-4 py-2 rounded-md hover:opacity-90 transition text-sm font-medium"
        >
          Add Product Line
        </button>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Create New Product Line</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setCreateForm({ 
                      name, 
                      slug: createForm.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
                    });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="e.g. ProCtrl"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (optional)</label>
                <input
                  type="text"
                  value={createForm.slug}
                  onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="Auto-generated from name"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({ name: '', slug: '' });
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 md:px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-900">Product Lines</h3>
          <span className="text-xs text-gray-500">{productLines.length} {productLines.length === 1 ? 'item' : 'items'}</span>
        </div>
        {productLines.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">No product lines found.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Name</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Code</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Slug</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Active</th>
                <th className="px-4 md:px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Assets</th>
                <th className="px-4 md:px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {productLines.map((pl) => (
                <tr key={pl.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    {editingId === pl.id ? (
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    ) : (
                      <div className="text-sm font-medium text-gray-900">{pl.name}</div>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{pl.code}</div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    {editingId === pl.id ? (
                      <input
                        type="text"
                        value={editForm.slug}
                        onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    ) : (
                      <div className="text-sm text-gray-500">{pl.slug}</div>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      pl.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {pl.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-500">{pl.asset_count}</div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    {editingId === pl.id ? (
                      <div className="flex justify-end items-center space-x-3">
                        <button
                          onClick={handleSave}
                          className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900 transition-colors"
                        >
                          <CheckIcon className="h-4 w-4 mr-1" />
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center text-sm text-gray-700 hover:text-gray-900 transition-colors"
                        >
                          <XMarkIcon className="h-4 w-4 mr-1" />
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end items-center space-x-3">
                        <button
                          onClick={() => handleEdit(pl)}
                          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
                          title="Edit"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(pl)}
                          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
                          title={pl.active ? 'Deactivate' : 'Activate'}
                        >
                          {pl.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {pl.asset_count === 0 && (
                          <button
                            onClick={() => handleDelete(pl)}
                            className="inline-flex items-center text-sm text-red-600 hover:text-red-700 transition-colors"
                            title="Delete"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

