'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import { supabase } from '../../../../lib/supabaseClient';
import { PageHeader } from '../../../components/qq/page-header';
import { Button } from '../../../components/qq/button';
import { Alert, AlertDescription } from '../../../components/qq/alert';
import { useToast } from '../../../components/ui/ToastProvider';
import {
  SLIFormFields,
  DEFAULT_SLI_FORM,
  DEFAULT_SLI_CHECKBOXES,
  type SLICompany,
  type SLIProduct,
  type SLISelectedProduct,
  type SLIFormData,
  type SLICheckboxStates,
} from '../../../components/admin/SLIFormFields';

export default function CreateStandaloneSLIPage() {
  const router = useRouter();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [companies, setCompanies] = useState<SLICompany[]>([]);
  const [products, setProducts] = useState<SLIProduct[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<SLISelectedProduct[]>([]);
  const [formData, setFormData] = useState<SLIFormData>(DEFAULT_SLI_FORM);
  const [checkboxes, setCheckboxes] = useState<SLICheckboxStates>(DEFAULT_SLI_CHECKBOXES);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (selectedProducts.length === 0) {
      setError('Please add at least one product.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/sli/standalone/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          company_id: selectedCompanyId || null,
          checkbox_states: checkboxes,
          selected_products: selectedProducts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create SLI.');
      toast.success('SLI created.');
      router.push('/admin/sli/documents');
    } catch (err: any) {
      setError(err.message || 'Failed to create SLI.');
    } finally {
      setSaving(false);
    }
  };

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
        title="Create SLI"
        description="Generate a standalone Shipper's Letter of Instruction."
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
            Create SLI
          </Button>
        </div>
      </form>
    </div>
  );
}
