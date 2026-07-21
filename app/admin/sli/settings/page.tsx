'use client';

/**
 * SLI settings — edits the sli_config singleton (USPPI block, freight
 * location, state of origin) and manages signers (sli_signers).
 * These values used to be hard-coded in the document renderers; after a
 * warehouse or personnel change, update them here — no code change needed.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Star, Trash2, Pencil } from 'lucide-react';

import { fetchWithAuth } from '../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../components/qq/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/qq/card';
import { Button } from '../../../components/qq/button';
import { Input } from '../../../components/qq/input';
import { FormField } from '../../../components/qq/form-field';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { useToast } from '../../../components/ui/ToastProvider';

interface SLIConfigForm {
  usppi_name: string;
  usppi_address_line1: string;
  usppi_address_line2: string;
  usppi_country: string;
  usppi_ein: string;
  freight_location_name: string;
  freight_location_address_line1: string;
  freight_location_address_line2: string;
  freight_location_country: string;
  state_of_origin: string;
}

interface Signer {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  signature_url: string;
  is_default: boolean;
}

const EMPTY_SIGNER_FORM = { name: '', title: '', email: '', phone: '', signature_url: '' };

export default function SLISettingsPage() {
  const toast = useToast();

  const [config, setConfig] = useState<SLIConfigForm | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signer add/edit form
  const [signerForm, setSignerForm] = useState(EMPTY_SIGNER_FORM);
  const [editingSignerId, setEditingSignerId] = useState<string | null>(null);
  const [showSignerForm, setShowSignerForm] = useState(false);
  const [savingSigner, setSavingSigner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAll();
  }, []);

  async function loadAll() {
    setLoading(true);
    try {
      const [configRes, signersRes] = await Promise.all([
        fetchWithAuth('/api/sli/config'),
        fetchWithAuth('/api/sli/signers'),
      ]);
      const configData = await configRes.json();
      const signersData = await signersRes.json();
      if (!configRes.ok) throw new Error(configData.error || 'Failed to load SLI settings.');
      setConfig(configData.config);
      setSigners(signersData.signers || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load SLI settings.');
    } finally {
      setLoading(false);
    }
  }

  const setCfg = (key: keyof SLIConfigForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setConfig((p) => (p ? { ...p, [key]: e.target.value } : p));

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!config) return;
    setSavingConfig(true);
    setError(null);
    try {
      const res = await fetchWithAuth('/api/sli/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to save.');
      toast.success('SLI settings saved.');
    } catch (err: any) {
      setError(err.message || 'Failed to save SLI settings.');
    } finally {
      setSavingConfig(false);
    }
  }

  function handleSignatureFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Signature must be an image file (PNG recommended).');
      return;
    }
    if (file.size > 1_400_000) {
      setError('Signature image is too large — keep it under 1.4MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      setSignerForm((p) => ({ ...p, signature_url: String(reader.result || '') }));
    reader.readAsDataURL(file);
  }

  function startEditSigner(signer: Signer) {
    setEditingSignerId(signer.id);
    setSignerForm({
      name: signer.name,
      title: signer.title,
      email: signer.email,
      phone: signer.phone,
      signature_url: signer.signature_url,
    });
    setShowSignerForm(true);
  }

  function resetSignerForm() {
    setSignerForm(EMPTY_SIGNER_FORM);
    setEditingSignerId(null);
    setShowSignerForm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function saveSigner(e: React.FormEvent) {
    e.preventDefault();
    setSavingSigner(true);
    setError(null);
    try {
      const url = editingSignerId ? `/api/sli/signers/${editingSignerId}` : '/api/sli/signers';
      const res = await fetchWithAuth(url, {
        method: editingSignerId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...signerForm, ...(editingSignerId ? {} : { is_default: signers.length === 0 }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.details || data.error || 'Failed to save signer.');
      toast.success(editingSignerId ? 'Signer updated.' : 'Signer added.');
      resetSignerForm();
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to save signer.');
    } finally {
      setSavingSigner(false);
    }
  }

  async function setDefaultSigner(id: string) {
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/sli/signers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set default.');
      toast.success('Default signer updated.');
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to set default signer.');
    }
  }

  async function deleteSigner(id: string, name: string) {
    if (!window.confirm(`Delete signer "${name}"? Existing SLIs will fall back to the default signer.`)) return;
    setError(null);
    try {
      const res = await fetchWithAuth(`/api/sli/signers/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete signer.');
      toast.success('Signer deleted.');
      await loadAll();
    } catch (err: any) {
      setError(err.message || 'Failed to delete signer.');
    }
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <div>
        <Link
          href="/admin/sli/documents"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to SLI documents
        </Link>
      </div>

      <PageHeader
        title="SLI settings"
        description="Company, warehouse, and signer details printed on every SLI document."
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading || !config ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Loading settings…
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Config */}
          <form onSubmit={saveConfig} className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">USPPI (boxes 1, 2, 7)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="USPPI name">
                    <Input value={config.usppi_name} onChange={setCfg('usppi_name')} />
                  </FormField>
                  <FormField label="USPPI EIN (IRS) no.">
                    <Input value={config.usppi_ein} onChange={setCfg('usppi_ein')} />
                  </FormField>
                  <FormField label="Address line 1">
                    <Input value={config.usppi_address_line1} onChange={setCfg('usppi_address_line1')} />
                  </FormField>
                  <FormField label="Address line 2 (city, state, zip)">
                    <Input value={config.usppi_address_line2} onChange={setCfg('usppi_address_line2')} />
                  </FormField>
                  <FormField label="Country">
                    <Input value={config.usppi_country} onChange={setCfg('usppi_country')} />
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Freight location / warehouse (boxes 3, 4, 14)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField label="Warehouse / freight company name">
                    <Input value={config.freight_location_name} onChange={setCfg('freight_location_name')} />
                  </FormField>
                  <FormField label="State of origin (box 14)">
                    <Input value={config.state_of_origin} onChange={setCfg('state_of_origin')} />
                  </FormField>
                  <FormField label="Address line 1">
                    <Input
                      value={config.freight_location_address_line1}
                      onChange={setCfg('freight_location_address_line1')}
                    />
                  </FormField>
                  <FormField label="Address line 2 (city, state, zip)">
                    <Input
                      value={config.freight_location_address_line2}
                      onChange={setCfg('freight_location_address_line2')}
                    />
                  </FormField>
                  <FormField label="Country">
                    <Input value={config.freight_location_country} onChange={setCfg('freight_location_country')} />
                  </FormField>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" loading={savingConfig}>
                Save settings
              </Button>
            </div>
          </form>

          {/* Signers */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm">Signers (boxes 42–46)</CardTitle>
              {!showSignerForm && (
                <Button type="button" variant="outline" size="sm" onClick={() => setShowSignerForm(true)}>
                  <Plus className="h-4 w-4" /> Add signer
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {signers.length === 0 && !showSignerForm && (
                <p className="text-sm text-muted-foreground">
                  No signers yet. Documents fall back to the built-in default until you add one.
                </p>
              )}

              {signers.map((signer) => (
                <div
                  key={signer.id}
                  className="flex items-center justify-between gap-4 border border-border rounded-md px-4 py-3"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {signer.signature_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={signer.signature_url}
                        alt={`${signer.name} signature`}
                        className="h-10 w-20 object-contain bg-white border border-border rounded"
                      />
                    ) : (
                      <div className="h-10 w-20 flex items-center justify-center text-xs text-muted-foreground border border-dashed border-border rounded">
                        No image
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {signer.name}
                        {signer.title ? <span className="text-muted-foreground"> — {signer.title}</span> : null}
                        {signer.is_default && (
                          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600">
                            <Star className="h-3 w-3 fill-current" /> Default
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[signer.email, signer.phone].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {!signer.is_default && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setDefaultSigner(signer.id)}
                      >
                        Set default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Edit signer"
                      onClick={() => startEditSigner(signer)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {!signer.is_default && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete signer"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteSigner(signer.id, signer.name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {showSignerForm && (
                <form onSubmit={saveSigner} className="border border-border rounded-md p-4 space-y-4">
                  <p className="text-sm font-medium">{editingSignerId ? 'Edit signer' : 'New signer'}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField label="Printed name (box 44)" required>
                      <Input
                        value={signerForm.name}
                        onChange={(e) => setSignerForm((p) => ({ ...p, name: e.target.value }))}
                        required
                      />
                    </FormField>
                    <FormField label="Title (box 46)">
                      <Input
                        value={signerForm.title}
                        onChange={(e) => setSignerForm((p) => ({ ...p, title: e.target.value }))}
                      />
                    </FormField>
                    <FormField label="E-mail (box 42)">
                      <Input
                        type="email"
                        value={signerForm.email}
                        onChange={(e) => setSignerForm((p) => ({ ...p, email: e.target.value }))}
                      />
                    </FormField>
                    <FormField label="Phone (box 43)">
                      <Input
                        value={signerForm.phone}
                        onChange={(e) => setSignerForm((p) => ({ ...p, phone: e.target.value }))}
                      />
                    </FormField>
                    <div className="md:col-span-2">
                      <FormField label="Signature image (box 45) — PNG with transparent background recommended">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleSignatureFile}
                          className="block w-full text-sm text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:text-sm file:border file:border-border file:rounded-md file:bg-background file:cursor-pointer"
                        />
                      </FormField>
                      {signerForm.signature_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={signerForm.signature_url}
                          alt="Signature preview"
                          className="mt-2 h-16 object-contain bg-white border border-border rounded"
                        />
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={resetSignerForm} disabled={savingSigner}>
                      Cancel
                    </Button>
                    <Button type="submit" loading={savingSigner}>
                      {editingSignerId ? 'Save signer' : 'Add signer'}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
