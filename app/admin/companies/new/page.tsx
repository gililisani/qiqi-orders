'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { supabase } from '../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../components/admin/AdminFormShell';
import { FormField } from '../../../components/qq/form-field';
import { Input } from '../../../components/qq/input';
import { Label } from '../../../components/qq/label';
import { Separator } from '../../../components/qq/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/qq/select';
import { useToast } from '../../../components/ui/ToastProvider';

interface Option {
  id: string;
  name: string;
  subsidiaryId?: string; // populated for locations, to filter by subsidiary (CSF)
}
interface SupportFundOption {
  id: string;
  percent: number;
}

const NONE = '__none__';

export default function NewCompanyPage() {
  const router = useRouter();
  const toast = useToast();

  const [formData, setFormData] = useState({
    company_name: '',
    netsuite_number: '',
    netsuite_internal_id: '',
    support_fund_id: '',
    subsidiary_id: '',
    class_id: '',
    location_id: '',
    cross_subsidiary_fulfillment: false,
    enable_credit_card_payments: false,
    credit_card_fee_percent: '',
    incoterm_id: '',
    payment_terms_id: '',
    company_address: '',
    company_email: '',
    company_phone: '',
    company_tax_number: '',
    ship_to_contact_name: '',
    ship_to_contact_email: '',
    ship_to_contact_phone: '',
    ship_to_street_line_1: '',
    ship_to_street_line_2: '',
    ship_to_city: '',
    ship_to_state: '',
    ship_to_postal_code: '',
    ship_to_country: '',
  });

  const [options, setOptions] = useState({
    supportFunds: [] as SupportFundOption[],
    subsidiaries: [] as Option[],
    classes: [] as Option[],
    locations: [] as Option[],
    incoterms: [] as Option[],
    paymentTerms: [] as Option[],
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Card payments are Qiqi-INC-only — track which subsidiary is INC (NS id 3).
  const [incSubsidiaryId, setIncSubsidiaryId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [supportFunds, subsidiaries, classes, locations, incoterms, paymentTerms] =
          await Promise.all([
            supabase.from('support_fund_levels').select('id, percent').order('percent'),
            supabase.from('subsidiaries').select('id, name, netsuite_id').order('name'),
            supabase.from('classes').select('id, name').order('name'),
            supabase.from('Locations').select('id, location_name, subsidiary_id').order('location_name'),
            supabase.from('incoterms').select('id, name').order('name'),
            supabase.from('payment_terms').select('id, name').order('name'),
          ]);
        const incSub = (subsidiaries.data || []).find((s: any) => String(s.netsuite_id) === '3');
        setIncSubsidiaryId(incSub?.id ?? null);
        setOptions({
          supportFunds: supportFunds.data || [],
          subsidiaries: subsidiaries.data || [],
          classes: classes.data || [],
          locations: (locations.data || []).map((l: any) => ({ id: l.id, name: l.location_name, subsidiaryId: l.subsidiary_id })),
          incoterms: incoterms.data || [],
          paymentTerms: paymentTerms.data || [],
        });
      } catch (err: any) {
        setError('Failed to load form options: ' + err.message);
      }
    })();
  }, []);

  const set = (key: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((p) => ({ ...p, [key]: e.target.value }));

  const setSelect = (key: keyof typeof formData) => (value: string) =>
    setFormData((p) => ({ ...p, [key]: value === NONE ? '' : value }));

  // CSF: scope the Location list to the client's own subsidiary — or, when
  // Cross-Subsidiary Fulfillment is on, to the OTHER subsidiaries' locations.
  const filteredLocations = options.locations.filter((l) =>
    !formData.subsidiary_id
      ? false
      : formData.cross_subsidiary_fulfillment
        ? l.subsidiaryId !== formData.subsidiary_id
        : l.subsidiaryId === formData.subsidiary_id,
  );
  const onChangeSubsidiary = (value: string) => {
    const newSub = value === NONE ? '' : value;
    const stillInc = !!incSubsidiaryId && newSub === incSubsidiaryId;
    setFormData((p) => ({
      ...p,
      subsidiary_id: newSub,
      location_id: '',
      enable_credit_card_payments: stillInc ? p.enable_credit_card_payments : false,
      credit_card_fee_percent: stillInc ? p.credit_card_fee_percent : '',
    }));
  };

  const isIncCompany = !!incSubsidiaryId && formData.subsidiary_id === incSubsidiaryId;
  const onToggleCsf = (checked: boolean) =>
    setFormData((p) => ({ ...p, cross_subsidiary_fulfillment: checked, location_id: '' }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.company_name.trim() || !formData.netsuite_number.trim()) {
      setError('Company name and NetSuite number are required.');
      return;
    }
    // CSF guardrail: when on, the location MUST be a different subsidiary's
    // (it becomes the SO Inventory Location). Block the inconsistent state.
    if (formData.cross_subsidiary_fulfillment) {
      const loc = options.locations.find((l) => l.id === formData.location_id);
      if (!loc) {
        setError('Cross-Subsidiary Fulfillment is on — choose a fulfillment location from another subsidiary.');
        return;
      }
      if (loc.subsidiaryId === formData.subsidiary_id) {
        setError('Cross-Subsidiary Fulfillment requires a location in a DIFFERENT subsidiary than the client.');
        return;
      }
    }
    // Credit-card fee must be a valid percent when card payments are enabled.
    if (formData.enable_credit_card_payments && formData.credit_card_fee_percent.trim() !== '') {
      const fee = Number(formData.credit_card_fee_percent);
      if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
        setError('Credit Card Fee % must be a number between 0 and 100.');
        return;
      }
    }
    setSaving(true);
    setError(null);

    try {
      // Pre-check uniqueness
      const { data: existing } = await supabase
        .from('companies')
        .select('id, company_name, netsuite_number')
        .eq('netsuite_number', formData.netsuite_number.trim())
        .maybeSingle();
      if (existing) {
        setError(
          `A company with NetSuite number "${formData.netsuite_number}" already exists (${existing.company_name}).`
        );
        setSaving(false);
        return;
      }

      const { error: insertError } = await supabase.from('companies').insert([
        {
          company_name: formData.company_name.trim(),
          netsuite_number: formData.netsuite_number.trim(),
          netsuite_internal_id: formData.netsuite_internal_id.trim() || null,
          support_fund_id: formData.support_fund_id || null,
          subsidiary_id: formData.subsidiary_id || null,
          class_id: formData.class_id || null,
          location_id: formData.location_id || null,
          cross_subsidiary_fulfillment: formData.cross_subsidiary_fulfillment,
          // Card payments are Qiqi-INC-only.
          enable_credit_card_payments: isIncCompany && formData.enable_credit_card_payments,
          credit_card_fee_percent:
            isIncCompany && formData.enable_credit_card_payments && formData.credit_card_fee_percent.trim() !== ''
              ? Number(formData.credit_card_fee_percent)
              : null,
          incoterm_id: formData.incoterm_id || null,
          payment_terms_id: formData.payment_terms_id || null,
          company_address: formData.company_address.trim() || null,
          company_email: formData.company_email.trim() || null,
          company_phone: formData.company_phone.trim() || null,
          company_tax_number: formData.company_tax_number.trim() || null,
          ship_to_contact_name: formData.ship_to_contact_name.trim() || null,
          ship_to_contact_email: formData.ship_to_contact_email.trim() || null,
          ship_to_contact_phone: formData.ship_to_contact_phone.trim() || null,
          ship_to_street_line_1: formData.ship_to_street_line_1.trim() || null,
          ship_to_street_line_2: formData.ship_to_street_line_2.trim() || null,
          ship_to_city: formData.ship_to_city.trim() || null,
          ship_to_state: formData.ship_to_state.trim() || null,
          ship_to_postal_code: formData.ship_to_postal_code.trim() || null,
          ship_to_country: formData.ship_to_country.trim() || null,
        },
      ]);

      if (insertError) {
        if (insertError.code === '23505') {
          setError(`A company with NetSuite number "${formData.netsuite_number}" already exists.`);
        } else {
          throw insertError;
        }
        return;
      }

      toast.success('Company created.');
      router.push('/admin/companies');
    } catch (err: any) {
      setError(err.message || 'Failed to create company.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminFormShell
      title="New company"
      description="Add a partner company that will place orders through the Hub."
      backHref="/admin/companies"
      backLabel="Back to companies"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push('/admin/companies')}
      submitLabel="Create company"
    >
      {/* ----- Basics ----- */}
      <Section title="Basics">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Company name" required>
            <Input value={formData.company_name} onChange={set('company_name')} autoFocus required />
          </FormField>
          <FormField
            label="NetSuite customer number"
            required
            helper='e.g. "C1752" — the number that appears before the customer name in NetSuite.'
          >
            <Input value={formData.netsuite_number} onChange={set('netsuite_number')} required />
          </FormField>
        </div>
        <FormField
          label="NetSuite Internal ID"
          helper="From Lists → Relationships → Customers, Internal ID column. Required for NetSuite integration."
        >
          <Input value={formData.netsuite_internal_id} onChange={set('netsuite_internal_id')} placeholder="e.g. 2023" />
        </FormField>
      </Section>

      {/* ----- Classification ----- */}
      <Section title="Classification">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SelectField
            label="Subsidiary"
            value={formData.subsidiary_id}
            onChange={onChangeSubsidiary}
            options={options.subsidiaries}
          />
          <SelectField
            label="Class"
            value={formData.class_id}
            onChange={setSelect('class_id')}
            options={options.classes}
          />
          <div>
            <SelectField
              label="Location"
              value={formData.location_id}
              onChange={setSelect('location_id')}
              options={filteredLocations}
            />
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.cross_subsidiary_fulfillment}
                onChange={(e) => onToggleCsf(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              Cross-Subsidiary Fulfillment
            </label>
            {!formData.subsidiary_id ? (
              <p className="mt-1 text-xs text-amber-700">Choose a subsidiary first.</p>
            ) : formData.cross_subsidiary_fulfillment ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Showing other subsidiaries&apos; locations — orders use this as the Inventory Location (fulfilled on this client&apos;s behalf).
              </p>
            ) : null}
          </div>
          <SelectField
            label="Support fund %"
            value={formData.support_fund_id}
            onChange={setSelect('support_fund_id')}
            options={options.supportFunds.map((s) => ({ id: s.id, name: `${s.percent}%` }))}
          />
          <SelectField
            label="Incoterm"
            value={formData.incoterm_id}
            onChange={setSelect('incoterm_id')}
            options={options.incoterms}
          />
          <SelectField
            label="Payment terms"
            value={formData.payment_terms_id}
            onChange={setSelect('payment_terms_id')}
            options={options.paymentTerms}
          />
          {isIncCompany && (
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.enable_credit_card_payments}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    enable_credit_card_payments: e.target.checked,
                    credit_card_fee_percent: e.target.checked ? p.credit_card_fee_percent : '',
                  }))
                }
                className="h-4 w-4 rounded border-input"
              />
              Enable Credit Card Payments
            </label>
            {formData.enable_credit_card_payments && (
              <div className="mt-2">
                <FormField label="Credit Card Fee %">
                  <div className="relative">
                    <Input
                      inputMode="decimal"
                      value={formData.credit_card_fee_percent}
                      onChange={set('credit_card_fee_percent')}
                      placeholder="3"
                      className="pr-7"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                </FormField>
                <p className="mt-1 text-xs text-muted-foreground">
                  Surcharge added to the invoice + card charge (e.g. 3, or 4.5 for higher-fee cards).
                </p>
              </div>
            )}
          </div>
          )}
        </div>
      </Section>

      {/* ----- Company contact ----- */}
      <Section title="Company contact">
        <FormField label="Address">
          <textarea
            value={formData.company_address}
            onChange={set('company_address')}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1"
          />
        </FormField>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Email">
            <Input type="email" value={formData.company_email} onChange={set('company_email')} />
          </FormField>
          <FormField label="Phone">
            <Input type="tel" value={formData.company_phone} onChange={set('company_phone')} />
          </FormField>
          <FormField label="Tax / VAT number">
            <Input value={formData.company_tax_number} onChange={set('company_tax_number')} />
          </FormField>
        </div>
      </Section>

      {/* ----- Ship-to ----- */}
      <Section title="Ship-to address">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Contact name">
            <Input value={formData.ship_to_contact_name} onChange={set('ship_to_contact_name')} />
          </FormField>
          <FormField label="Contact email">
            <Input type="email" value={formData.ship_to_contact_email} onChange={set('ship_to_contact_email')} />
          </FormField>
          <FormField label="Contact phone">
            <Input type="tel" value={formData.ship_to_contact_phone} onChange={set('ship_to_contact_phone')} />
          </FormField>
        </div>
        <FormField label="Street address line 1">
          <Input value={formData.ship_to_street_line_1} onChange={set('ship_to_street_line_1')} />
        </FormField>
        <FormField label="Street address line 2">
          <Input value={formData.ship_to_street_line_2} onChange={set('ship_to_street_line_2')} />
        </FormField>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <FormField label="City">
            <Input value={formData.ship_to_city} onChange={set('ship_to_city')} />
          </FormField>
          <FormField label="State / Region">
            <Input value={formData.ship_to_state} onChange={set('ship_to_state')} />
          </FormField>
          <FormField label="Postal code">
            <Input value={formData.ship_to_postal_code} onChange={set('ship_to_postal_code')} />
          </FormField>
          <FormField label="Country">
            <Input value={formData.ship_to_country} onChange={set('ship_to_country')} />
          </FormField>
        </div>
      </Section>
    </AdminFormShell>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        <Separator className="mt-2" />
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Option[];
}) {
  return (
    <div>
      <Label className="text-sm font-medium">{label}</Label>
      <div className="mt-1.5">
        <Select value={value || undefined} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Choose…`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>— None —</SelectItem>
            {options.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
