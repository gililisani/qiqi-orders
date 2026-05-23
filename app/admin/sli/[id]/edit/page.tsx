'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { supabase } from '../../../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../../../lib/fetchWithAuth';
import { PageHeader } from '../../../../components/qq/page-header';
import { Button } from '../../../../components/qq/button';
import { Alert, AlertDescription } from '../../../../components/qq/alert';
import { useToast } from '../../../../components/ui/ToastProvider';
import {
  SLIFormFields,
  DEFAULT_SLI_FORM,
  DEFAULT_SLI_CHECKBOXES,
  type SLICompany,
  type SLIProduct,
  type SLISelectedProduct,
  type SLIFormData,
  type SLICheckboxStates,
} from '../../../../components/admin/SLIFormFields';

export default function EditStandaloneSLIPage() {
  const router = useRouter();
  const params = useParams();
  const sliId = params.id as string;
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<SLICompany[]>([]);
  const [products, setProducts] = useState<SLIProduct[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<SLISelectedProduct[]>([]);
  const [formData, setFormData] = useState<SLIFormData>(DEFAULT_SLI_FORM);
  const [checkboxes, setCheckboxes] = useState<SLICheckboxStates>(DEFAULT_SLI_CHECKBOXES);
  const [initialCompanySearch, setInitialCompanySearch] = useState('');
  const [sliNumber, setSliNumber] = useState<number | null>(null);

  // Load static data first
  useEffect(() => {
    (async () => {
      const [c, p] = await Promise.all([
        supabase
          .from('companies')
          .select(
            'id, company_name, ship_to_street_line_1, ship_to_street_line_2, ship_to_city, ship_to_state, ship_to_postal_code, ship_to_country, company_address'
          )
          .order('company_name'),
        supabase.from('Products').select('id, item_name, hs_code, case_weight, made_in').order('item_name'),
      ]);
      setCompanies(c.data || []);
      setProducts(p.data || []);
    })();
  }, []);

  // Load SLI once companies are available (so we can resolve company name).
  useEffect(() => {
    if (!sliId || companies.length === 0) return;
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/sli/standalone/${sliId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch SLI.');
        const sli = data.sli;

        setFormData({
          consignee_name: sli.consignee_name || '',
          consignee_address_line1: sli.consignee_address_line1 || '',
          consignee_address_line2: sli.consignee_address_line2 || '',
          consignee_address_line3: sli.consignee_address_line3 || '',
          consignee_country: sli.consignee_country || '',
          invoice_number: sli.invoice_number || '',
          sli_date: sli.sli_date
            ? sli.sli_date.split('T')[0]
            : new Date().toISOString().split('T')[0],
          date_of_export: sli.date_of_export ? sli.date_of_export.split('T')[0] : '',
          forwarding_agent_line1: sli.forwarding_agent_line1 || '',
          forwarding_agent_line2: sli.forwarding_agent_line2 || '',
          forwarding_agent_line3: sli.forwarding_agent_line3 || '',
          forwarding_agent_line4: sli.forwarding_agent_line4 || '',
          in_bond_code: sli.in_bond_code || '',
          instructions_to_forwarder: sli.instructions_to_forwarder || '',
        });
        setSelectedCompanyId(sli.company_id || '');
        setSliNumber(sli.sli_number || null);

        const matchedCompany = sli.company_id
          ? companies.find((c) => c.id === sli.company_id)
          : null;
        setInitialCompanySearch(matchedCompany?.company_name || sli.consignee_name || '');

        setCheckboxes((prev) => ({ ...prev, ...(sli.checkbox_states || {}) }));
        setSelectedProducts(sli.selected_products || []);
      } catch (err: any) {
        setError(err.message || 'Failed to load SLI.');
      } finally {
        setLoading(false);
      }
    })();
  }, [sliId, companies]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selectedProducts.length === 0) {
      setError('Please add at least one product.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth(`/api/sli/standalone/${sliId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          company_id: selectedCompanyId || null,
          checkbox_states: checkboxes,
          selected_products: selectedProducts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update SLI.');
      toast.success('SLI updated.');
      router.push('/admin/sli/documents');
    } catch (err: any) {
      setError(err.message || 'Failed to update SLI.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading SLI…</p>
      </div>
    );
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
        title={sliNumber ? `Edit SLI #${sliNumber}` : 'Edit SLI'}
        description={formData.consignee_name || undefined}
      />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        <SLIFormFields
          formData={formData}
          onChangeForm={(patch) => setFormData((p) => ({ ...p, ...patch }))}
          checkboxes={checkboxes}
          onChangeCheckbox={(key) => setCheckboxes((p) => ({ ...p, [key]: !p[key] }))}
          companies={companies}
          products={products}
          selectedProducts={selectedProducts}
          onChangeSelectedProducts={setSelectedProducts}
          selectedCompanyId={selectedCompanyId}
          onChangeSelectedCompanyId={setSelectedCompanyId}
          initialCompanySearch={initialCompanySearch}
          onProductAddError={(msg) => setError(msg)}
        />

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/admin/sli/documents')}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="submit" loading={saving} disabled={selectedProducts.length === 0}>
            Save changes
          </Button>
        </div>
      </form>
    </div>
  );
}
