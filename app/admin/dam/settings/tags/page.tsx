'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../../../lib/supabaseClient';
import { PencilIcon, TrashIcon, CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface Tag {
  id: string;
  slug: string;
  label: string;
  asset_count: number;
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ label: string }>({ label: '' });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<{ label: string }>({ label: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTags();
  }, [searchTerm]);

  const fetchTags = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const url = searchTerm 
        ? `/api/admin/tags?search=${encodeURIComponent(searchTerm)}`
        : '/api/admin/tags';

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to load tags');
      }

      const data = await response.json();
      setTags(data.tags || []);
    } catch (err: any) {
      console.error('Error fetching tags:', err);
      setError(err.message || 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditForm({ label: tag.label });
  };

  const handleSave = async () => {
    if (!editingId) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/tags', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: editingId,
          label: editForm.label,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update tag');
      }

      setEditingId(null);
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Failed to update tag');
    }
  };

  const handleCreate = async () => {
    if (!createForm.label.trim()) {
      setError('Tag name is required');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          label: createForm.label,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create tag');
      }

      setShowCreateModal(false);
      setCreateForm({ label: '' });
      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Failed to create tag');
    }
  };

  const handleDelete = async (tag: Tag) => {
    const message = tag.asset_count > 0
      ? `Delete tag "${tag.label}"? It will be removed from ${tag.asset_count} asset(s) and cannot be undone.`
      : `Delete tag "${tag.label}"?`;

    if (!confirm(message)) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(`/api/admin/tags?id=${tag.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete tag');
      }

      fetchTags();
    } catch (err: any) {
      setError(err.message || 'Failed to delete tag');
    }
  };

  if (loading) {
    return (
      <div className="mt-8 mb-4 space-y-6">
        <p className="text-gray-500">Loading tags...</p>
      </div>
    );
  }

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Tags Settings</h2>
          <p className="text-sm text-gray-500 mt-1">Manage tags for categorizing and searching assets</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-black text-white px-4 py-2 rounded-md hover:opacity-90 transition text-sm font-medium"
        >
          Add Tag
        </button>
      </div>

      <div className="flex gap-4 items-center">
        <input
          type="text"
          placeholder="Search tags by name or slug..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 max-w-md px-4 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
        />
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold mb-4">Create New Tag</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tag Name *</label>
                <input
                  type="text"
                  value={createForm.label}
                  onChange={(e) => setCreateForm({ label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  placeholder="e.g. Marketing, Product, Campaign"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateForm({ label: '' });
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
          <h3 className="text-sm font-semibold text-gray-900">Tags</h3>
          <span className="text-xs text-gray-500">{tags.length} {tags.length === 1 ? 'item' : 'items'}</span>
        </div>
        {tags.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p className="text-sm">No tags found.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Tag Name</th>
                <th className="px-4 md:px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Slug</th>
                <th className="px-4 md:px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Assets</th>
                <th className="px-4 md:px-6 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tags.map((tag) => (
                <tr key={tag.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    {editingId === tag.id ? (
                      <input
                        type="text"
                        value={editForm.label}
                        onChange={(e) => setEditForm({ label: e.target.value })}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black"
                      />
                    ) : (
                      <div className="text-sm font-medium text-gray-900">{tag.label}</div>
                    )}
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{tag.slug}</div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-500">{tag.asset_count}</div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    {editingId === tag.id ? (
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
                          onClick={() => handleEdit(tag)}
                          className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
                          title="Rename"
                        >
                          <PencilIcon className="h-4 w-4 mr-1" />
                          Rename
                        </button>
                        <button
                          onClick={() => handleDelete(tag)}
                          className="inline-flex items-center text-sm text-red-600 hover:text-red-700 transition-colors"
                          title="Delete"
                        >
                          <TrashIcon className="h-4 w-4 mr-1" />
                          Delete
                        </button>
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

