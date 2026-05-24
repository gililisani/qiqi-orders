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

interface Locale {
  code: string;
  label: string;
  is_default: boolean;
  active: boolean;
  asset_count: number;
}

export default function LocalesPage() {
  const toast = useToast();
  const confirm = useConfirm();

  const [locales, setLocales] = useState<Locale[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ code: '', label: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLocales();
  }, []);

  const fetchLocales = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/api/admin/locales');
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load locales');
      }
      const data = await res.json();
      setLocales(data.locales || []);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load locales.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!editingCode) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/locales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: editingCode, label: editLabel }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update locale');
      }
      toast.success('Locale updated.');
      setEditingCode(null);
      fetchLocales();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update locale.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (locale: Locale) => {
    try {
      const res = await fetchWithAuth('/api/admin/locales', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: locale.code, active: !locale.active }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to toggle locale');
      }
      fetchLocales();
    } catch (err: any) {
      toast.error(err.message || 'Failed to toggle locale.');
    }
  };

  const handleCreate = async () => {
    if (!createForm.code.trim() || !createForm.label.trim()) {
      toast.error('Code and label are required.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/admin/locales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create locale');
      }
      toast.success('Locale created.');
      setShowCreateModal(false);
      setCreateForm({ code: '', label: '' });
      fetchLocales();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create locale.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (locale: Locale) => {
    if (locale.is_default) {
      toast.error('Cannot delete the default locale.');
      return;
    }
    const ok = await confirm({
      title: 'Delete locale?',
      description:
        locale.asset_count > 0
          ? `Delete "${locale.label}". It will be removed from ${locale.asset_count} asset${
              locale.asset_count !== 1 ? 's' : ''
            }. This cannot be undone.`
          : `Delete "${locale.label}"?`,
      variant: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    try {
      const res = await fetchWithAuth(`/api/admin/locales?code=${locale.code}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete locale');
      }
      toast.success('Locale deleted.');
      fetchLocales();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete locale.');
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
        title="Locales"
        description="Language and locale options for assets."
        actions={
          <Button size="sm" onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4" /> Add locale
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
        ) : locales.length === 0 ? (
          <EmptyState
            title="No locales"
            description="Add locales to support multi-language assets."
            action={
              <Button size="sm" onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4" /> Add locale
              </Button>
            }
            className="border-0 shadow-none"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right hidden sm:table-cell">Assets</TableHead>
                <TableHead className="text-right w-40">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locales.map((locale) => (
                <TableRow key={locale.code}>
                  <TableCell className="font-mono text-xs">{locale.code}</TableCell>
                  <TableCell>
                    {editingCode === locale.code ? (
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="text-sm font-medium">{locale.label}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {locale.active ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="muted">Inactive</Badge>
                      )}
                      {locale.is_default && <Badge variant="accent">Default</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-right font-mono text-sm">
                    {locale.asset_count}
                  </TableCell>
                  <TableCell className="text-right">
                    {editingCode === locale.code ? (
                      <div className="inline-flex gap-1.5">
                        <Button size="sm" onClick={handleSave} loading={saving}>
                          <Check className="h-3.5 w-3.5" /> Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditingCode(null)}
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
                            setEditingCode(locale.code);
                            setEditLabel(locale.label);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleActive(locale)}
                          className="text-xs"
                        >
                          {locale.active ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(locale)}
                          disabled={locale.is_default}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
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
            <DialogTitle>New locale</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm font-medium">Code *</Label>
              <Input
                value={createForm.code}
                onChange={(e) =>
                  setCreateForm({ ...createForm, code: e.target.value.toLowerCase() })
                }
                placeholder="e.g. en, fr-fr, es"
                className="mt-1.5 font-mono"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-sm font-medium">Label *</Label>
              <Input
                value={createForm.label}
                onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })}
                placeholder="e.g. English, French (France)"
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateModal(false);
                setCreateForm({ code: '', label: '' });
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
