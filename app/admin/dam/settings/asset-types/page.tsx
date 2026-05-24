'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X } from 'lucide-react';

import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';

import { PageHeader } from '../../../../components/qq/page-header';
import { Card } from '../../../../components/qq/card';
import { Input } from '../../../../components/qq/input';
import { Label } from '../../../../components/qq/label';
import { Button } from '../../../../components/qq/button';
import { Badge } from '../../../../components/qq/badge';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { EmptyState } from '../../../../components/qq/empty-state';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../../../../components/qq/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../../components/qq/dialog';
import { useToast } from '../../../../components/ui/ToastProvider';
import { useConfirm } from '../../../../components/ui/ConfirmProvider';

interface AssetType {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  display_order: number;
  asset_count: number;
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

export default function AssetTypesPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [items, setItems] = useState<AssetType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', slug: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/admin/asset-types');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load asset types');
      }
      const data = await res.json();
      setItems(data.assetTypes || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load asset types.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/asset-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update asset type');
      }
      toast.success('Asset type updated.');
      setEditingId(null);
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update asset type.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: AssetType) => {
    try {
      const res = await fetchWithAuth('/api/admin/asset-types', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, active: !item.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to toggle');
      }
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle.');
    }
  };

  const handleCreate = async () => {
    if (!createForm.name.trim()) {
      toast.error('Name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/asset-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          slug: createForm.slug || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create asset type');
      }
      toast.success('Asset type created.');
      setShowCreateModal(false);
      setCreateForm({ name: '', slug: '' });
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create asset type.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: AssetType) => {
    const ok = await confirm({
      title: 'Delete asset type?',
      description:
        item.asset_count > 0
          ? `"${item.name}" is used by ${item.asset_count} asset${
              item.asset_count !== 1 ? 's' : ''
            }. Delete anyway?`
          : `Delete "${item.name}"?`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const res = await fetchWithAuth(`/api/admin/asset-types?id=${item.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete');
      }
      toast.success('Asset type deleted.');
      fetchItems();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete.');
    }
  };

  return (
    <div className="px-6 py-8 space-y-4">
      <div>
        <Link
          href="/admin/dam/settings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to DAM settings
        </Link>
      </div>

      <PageHeader
        title="Asset types"
        description="Main asset categories (Image, Video, Document, etc.)."
        actions={
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" /> Add asset type
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground p-4">Loading…</p>
        ) : items.length === 0 ? (
          <EmptyState
            title="No asset types"
            description="Add asset types to organize the library."
            action={
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" /> Add asset type
              </Button>
            }
            className="border-0 shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Assets</TableHead>
                <TableHead className="text-right w-44">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {editingId === item.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium">{item.name}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                    {item.slug}
                  </TableCell>
                  <TableCell>
                    {item.active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="muted">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                    {item.asset_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === item.id ? (
                      <div className="inline-flex gap-1.5">
                        <Button size="sm" onClick={handleSave} loading={saving}>
                          <Check className="h-3.5 w-3.5" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(item.id);
                            setEditName(item.name);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(item)}
                          className="text-xs"
                        >
                          {item.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={showCreateModal} onOpenChange={(open) => !saving && setShowCreateModal(open)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New asset type</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm font-medium">Name *</Label>
              <Input
                value={createForm.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setCreateForm({
                    name,
                    slug: createForm.slug || slugify(name),
                  });
                }}
                placeholder="e.g. Artwork"
                className="mt-1.5"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Slug</Label>
              <Input
                value={createForm.slug}
                onChange={(e) => setCreateForm({ ...createForm, slug: e.target.value })}
                placeholder="auto-generated from name"
                className="mt-1.5 font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setCreateForm({ name: '', slug: '' });
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} loading={saving}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
