'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react';

import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';

import { PageHeader } from '../../../../components/qq/page-header';
import { Card } from '../../../../components/qq/card';
import { Input } from '../../../../components/qq/input';
import { Label } from '../../../../components/qq/label';
import { Button } from '../../../../components/qq/button';
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

interface Tag {
  id: string;
  slug: string;
  label: string;
  asset_count: number;
}

export default function TagsPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createLabel, setCreateLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = setTimeout(fetchTags, searchTerm ? 300 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm]);

  const fetchTags = async () => {
    try {
      setLoading(true);
      const url = searchTerm
        ? `/api/admin/tags?search=${encodeURIComponent(searchTerm)}`
        : '/api/admin/tags';
      const res = await fetchWithAuth(url);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load tags');
      }
      const data = await res.json();
      setTags(data.tags || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load tags.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/tags', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, label: editLabel }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update tag');
      }
      toast.success('Tag updated.');
      setEditingId(null);
      fetchTags();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update tag.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!createLabel.trim()) {
      toast.error('Tag name is required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: createLabel }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create tag');
      }
      toast.success('Tag created.');
      setShowCreateModal(false);
      setCreateLabel('');
      fetchTags();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create tag.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: Tag) => {
    const ok = await confirm({
      title: 'Delete tag?',
      description:
        tag.asset_count > 0
          ? `Delete "${tag.label}". It will be removed from ${tag.asset_count} asset${
              tag.asset_count !== 1 ? 's' : ''
            }. This cannot be undone.`
          : `Delete "${tag.label}"?`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const res = await fetchWithAuth(`/api/admin/tags?id=${tag.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete tag');
      }
      toast.success('Tag deleted.');
      fetchTags();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete tag.');
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
        title="Tags"
        description="Tags for categorizing and searching assets."
        actions={
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" /> Add tag
          </Button>
        }
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card className="p-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search tags by name or slug…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </Card>

      <Card>
        {loading ? (
          <p className="text-sm text-muted-foreground p-4">Loading…</p>
        ) : tags.length === 0 ? (
          <EmptyState
            title="No tags"
            description={
              searchTerm ? 'Try a different search.' : 'Add tags to organize the asset library.'
            }
            action={
              !searchTerm ? (
                <Button size="sm" onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4" /> Add tag
                </Button>
              ) : undefined
            }
            className="border-0 shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead className="hidden sm:table-cell">Slug</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Assets</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tags.map((tag) => (
                <TableRow key={tag.id}>
                  <TableCell>
                    {editingId === tag.id ? (
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium">{tag.label}</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-xs text-muted-foreground">
                    {tag.slug}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                    {tag.asset_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingId === tag.id ? (
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
                          <X className="h-3.5 w-3.5" /> Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingId(tag.id);
                            setEditLabel(tag.label);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(tag)}
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
            <DialogTitle>New tag</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-sm font-medium">Tag name *</Label>
            <Input
              value={createLabel}
              onChange={(e) => setCreateLabel(e.target.value)}
              placeholder="e.g. Marketing"
              className="mt-1.5"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setCreateLabel('');
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
