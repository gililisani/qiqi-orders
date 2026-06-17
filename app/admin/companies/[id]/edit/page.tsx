'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, Trash2, X } from 'lucide-react';

import { supabase } from '../../../../../lib/supabaseClient';
import { AdminFormShell } from '../../../../components/admin/AdminFormShell';
import { FormField } from '../../../../components/qq/form-field';
import { Input } from '../../../../components/qq/input';
import { Label } from '../../../../components/qq/label';
import { Button } from '../../../../components/qq/button';
import { Separator } from '../../../../components/qq/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/qq/select';
import { useToast } from '../../../../components/ui/ToastProvider';

interface Option {
  id: string;
  name: string;
  subsidiaryId?: string; // populated for locations, to filter by subsidiary (CSF)
}
interface SupportFundOption {
  id: string;
  percent: number;
}
interface TargetPeriod {
  id?: string;
  period_name: string;
  start_date: string;
  end_date: string;
  target_amount: string;
}
interface Country {
  country_code: string;
  country_name: string;
}

const NONE = '__none__';

const FALLBACK_COUNTRIES: Country[] = [
  { country_code: 'US', country_name: 'United States' },
  { country_code: 'CA', country_name: 'Canada' },
  { country_code: 'MX', country_name: 'Mexico' },
  { country_code: 'GB', country_name: 'United Kingdom' },
  { country_code: 'DE', country_name: 'Germany' },
  { country_code: 'FR', country_name: 'France' },
  { country_code: 'IT', country_name: 'Italy' },
  { country_code: 'ES', country_name: 'Spain' },
  { country_code: 'AU', country_name: 'Australia' },
  { country_code: 'JP', country_name: 'Japan' },
  { country_code: 'CN', country_name: 'China' },
  { country_code: 'IN', country_name: 'India' },
  { country_code: 'BR', country_name: 'Brazil' },
  { country_code: 'AE', country_name: 'United Arab Emirates' },
  { country_code: 'SA', country_name: 'Saudi Arabia' },
  { country_code: 'IL', country_name: 'Israel' },
  { country_code: 'SG', country_name: 'Singapore' },
  { country_code: 'KR', country_name: 'South Korea' },
  { country_code: 'NL', country_name: 'Netherlands' },
  { country_code: 'CH', country_name: 'Switzerland' },
];

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const companyId = params.id as string;

  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState({
    supportFunds: [] as SupportFundOption[],
    subsidiaries: [] as Option[],
    classes: [] as Option[],
    locations: [] as Option[],
    incoterms: [] as Option[],
    paymentTerms: [] as Option[],
  });

  const [allCountries, setAllCountries] = useState<Country[]>([]);
  const [territoryInput, setTerritoryInput] = useState('');
  const [territorySuggestions, setTerritorySuggestions] = useState<Country[]>([]);
  const territoryRef = useRef<HTMLDivElement>(null);

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
    contract_execution_date: '',
    contract_duration_months: '36',
    contract_status: 'active',
    target_periods: [] as TargetPeriod[],
    territories: [] as string[],
  });

  // ---- Load everything ----
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const [company, territoriesRes, targetsRes, supportFunds, subsidiaries, classes, locations, incoterms, paymentTerms, countriesRes] =
          await Promise.all([
            supabase.from('companies').select('*').eq('id', companyId).single(),
            supabase.from('company_territories').select('*').eq('company_id', companyId),
            supabase.from('target_periods').select('*').eq('company_id', companyId).order('start_date'),
            supabase.from('support_fund_levels').select('id, percent').order('percent'),
            supabase.from('subsidiaries').select('id, name').order('name'),
            supabase.from('classes').select('id, name').order('name'),
            supabase.from('Locations').select('id, location_name, subsidiary_id').order('location_name'),
            supabase.from('incoterms').select('id, name').order('name'),
            supabase.from('payment_terms').select('id, name').order('name'),
            supabase.rpc('get_countries_list'),
          ]);

        if (company.error) throw company.error;
        const c = company.data;

        setFormData({
          company_name: c.company_name || '',
          netsuite_number: c.netsuite_number || '',
          netsuite_internal_id: c.netsuite_internal_id || '',
          support_fund_id: c.support_fund_id || '',
          subsidiary_id: c.subsidiary_id || '',
          class_id: c.class_id || '',
          location_id: c.location_id || '',
          cross_subsidiary_fulfillment: c.cross_subsidiary_fulfillment ?? false,
          enable_credit_card_payments: c.enable_credit_card_payments ?? false,
          credit_card_fee_percent:
            c.credit_card_fee_percent != null ? String(c.credit_card_fee_percent) : '',
          incoterm_id: c.incoterm_id || '',
          payment_terms_id: c.payment_terms_id || '',
          company_address: c.company_address || '',
          company_email: c.company_email || '',
          company_phone: c.company_phone || '',
          company_tax_number: c.company_tax_number || '',
          ship_to_contact_name: c.ship_to_contact_name || '',
          ship_to_contact_email: c.ship_to_contact_email || '',
          ship_to_contact_phone: c.ship_to_contact_phone || '',
          ship_to_street_line_1: c.ship_to_street_line_1 || '',
          ship_to_street_line_2: c.ship_to_street_line_2 || '',
          ship_to_city: c.ship_to_city || '',
          ship_to_state: c.ship_to_state || '',
          ship_to_postal_code: c.ship_to_postal_code || '',
          ship_to_country: c.ship_to_country || '',
          contract_execution_date: c.contract_execution_date || '',
          contract_duration_months: c.contract_duration_months?.toString() || '36',
          contract_status: c.contract_status || 'active',
          target_periods:
            targetsRes.data?.map((tp: any) => ({
              id: tp.id,
              period_name: tp.period_name,
              start_date: tp.start_date,
              end_date: tp.end_date,
              target_amount: tp.target_amount.toString(),
            })) || [],
          territories: territoriesRes.data?.map((t: any) => t.country_code) || [],
        });

        setOptions({
          supportFunds: supportFunds.data || [],
          subsidiaries: subsidiaries.data || [],
          classes: classes.data || [],
          locations: (locations.data || []).map((l: any) => ({ id: l.id, name: l.location_name, subsidiaryId: l.subsidiary_id })),
          incoterms: incoterms.data || [],
          paymentTerms: paymentTerms.data || [],
        });

        setAllCountries(countriesRes.error ? FALLBACK_COUNTRIES : countriesRes.data || FALLBACK_COUNTRIES);
      } catch (err: any) {
        setError(err.message || 'Failed to load company.');
      } finally {
        setInitialLoading(false);
      }
    })();
  }, [companyId]);

  // ---- Click outside for territory suggestions ----
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (territoryRef.current && !territoryRef.current.contains(e.target as Node)) {
        setTerritorySuggestions([]);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // ---- Helpers ----
  const set = (key: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFormData((p) => ({ ...p, [key]: e.target.value }));

  const setSelect = (key: keyof typeof formData) => (value: string) =>
    setFormData((p) => ({ ...p, [key]: value === NONE ? '' : value }));

  // CSF: scope the Location list to the client's own subsidiary — or, when
  // Cross-Subsidiary Fulfillment is on, to the OTHER subsidiaries' locations
  // (e.g. a Qiqi INC client fulfilled from Qiqi Global's Brandfox warehouse).
  const filteredLocations = options.locations.filter((l) =>
    !formData.subsidiary_id
      ? false
      : formData.cross_subsidiary_fulfillment
        ? l.subsidiaryId !== formData.subsidiary_id
        : l.subsidiaryId === formData.subsidiary_id,
  );

  // Changing the subsidiary or toggling CSF can invalidate the chosen location,
  // so clear it — the admin re-picks from the now-correct filtered list.
  const onChangeSubsidiary = (value: string) =>
    setFormData((p) => ({ ...p, subsidiary_id: value === NONE ? '' : value, location_id: '' }));
  const onToggleCsf = (checked: boolean) =>
    setFormData((p) => ({ ...p, cross_subsidiary_fulfillment: checked, location_id: '' }));

  // ---- Territories ----
  const handleTerritoryInput = (value: string) => {
    setTerritoryInput(value);
    if (!value.trim()) {
      setTerritorySuggestions([]);
      return;
    }
    const q = value.toLowerCase().trim();
    const filtered = allCountries
      .filter(
        (c) =>
          c.country_name &&
          c.country_name.toLowerCase().includes(q) &&
          !formData.territories.includes(c.country_code)
      )
      .sort((a, b) => {
        const aStarts = a.country_name.toLowerCase().startsWith(q);
        const bStarts = b.country_name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.country_name.localeCompare(b.country_name);
      })
      .slice(0, 8);
    setTerritorySuggestions(filtered);
  };

  const addTerritory = (country: Country) => {
    setFormData((p) => ({ ...p, territories: [...p.territories, country.country_code] }));
    setTerritoryInput('');
    setTerritorySuggestions([]);
  };

  const removeTerritory = (code: string) =>
    setFormData((p) => ({ ...p, territories: p.territories.filter((c) => c !== code) }));

  // ---- Target periods ----
  const addTargetPeriod = () => {
    const duration = parseInt(formData.contract_duration_months) || 0;
    const count = formData.target_periods.length;
    if (duration <= count * 12) {
      toast.error(`Contract duration (${duration} mo) must exceed ${count * 12} months to add another period.`);
      return;
    }
    setFormData((p) => ({
      ...p,
      target_periods: [
        ...p.target_periods,
        { period_name: `Year ${count + 1}`, start_date: '', end_date: '', target_amount: '' },
      ],
    }));
  };

  const removeTargetPeriod = (i: number) =>
    setFormData((p) => ({ ...p, target_periods: p.target_periods.filter((_, idx) => idx !== i) }));

  const updateTargetPeriod = (i: number, field: keyof TargetPeriod, value: string) =>
    setFormData((p) => ({
      ...p,
      target_periods: p.target_periods.map((tp, idx) => (idx === i ? { ...tp, [field]: value } : tp)),
    }));

  // ---- Save ----
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
      const { error: updateError } = await supabase
        .from('companies')
        .update({
          company_name: formData.company_name.trim(),
          netsuite_number: formData.netsuite_number.trim(),
          netsuite_internal_id: formData.netsuite_internal_id.trim() || null,
          support_fund_id: formData.support_fund_id || null,
          subsidiary_id: formData.subsidiary_id || null,
          class_id: formData.class_id || null,
          location_id: formData.location_id || null,
          cross_subsidiary_fulfillment: formData.cross_subsidiary_fulfillment,
          enable_credit_card_payments: formData.enable_credit_card_payments,
          credit_card_fee_percent:
            formData.enable_credit_card_payments && formData.credit_card_fee_percent.trim() !== ''
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
          contract_execution_date: formData.contract_execution_date || null,
          contract_duration_months: formData.contract_duration_months
            ? parseInt(formData.contract_duration_months)
            : null,
          contract_status: formData.contract_status || 'active',
        })
        .eq('id', companyId);
      if (updateError) {
        if (updateError.code === '23505') {
          setError(`A company with NetSuite number "${formData.netsuite_number}" already exists.`);
          return;
        }
        throw updateError;
      }

      // Replace territories
      await supabase.from('company_territories').delete().eq('company_id', companyId);
      if (formData.territories.length > 0) {
        const rows = formData.territories.map((code) => {
          const c = allCountries.find((x) => x.country_code === code);
          return {
            company_id: companyId,
            country_code: code,
            country_name: c?.country_name || code,
          };
        });
        const { error: tErr } = await supabase.from('company_territories').insert(rows);
        if (tErr) throw tErr;
      }

      // Replace target periods
      await supabase.from('target_periods').delete().eq('company_id', companyId);
      if (formData.target_periods.length > 0) {
        const rows = formData.target_periods.map((tp) => ({
          company_id: companyId,
          period_name: tp.period_name,
          start_date: tp.start_date,
          end_date: tp.end_date,
          target_amount: parseFloat(tp.target_amount) || 0,
        }));
        const { error: tpErr } = await supabase.from('target_periods').insert(rows);
        if (tpErr) throw tpErr;
      }

      toast.success('Company updated.');
      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message || 'Failed to update company.');
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="px-6 py-8">
        <p className="text-sm text-muted-foreground">Loading company…</p>
      </div>
    );
  }

  return (
    <AdminFormShell
      title="Edit company"
      description={formData.company_name || undefined}
      backHref={`/admin/companies/${companyId}`}
      backLabel="Back to company"
      saving={saving}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => router.push(`/admin/companies/${companyId}`)}
      submitLabel="Save changes"
    >
      {/* ----- Basics ----- */}
      <Section title="Basics">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Company name" required>
            <Input value={formData.company_name} onChange={set('company_name')} required />
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
          <Input
            value={formData.netsuite_internal_id}
            onChange={set('netsuite_internal_id')}
            placeholder="e.g. 2023"
          />
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

      {/* ----- Contract ----- */}
      <Section title="Contract">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Execution date">
            <Input
              type="date"
              value={formData.contract_execution_date}
              onChange={set('contract_execution_date')}
            />
          </FormField>
          <FormField label="Duration (months)">
            <Input
              type="number"
              min={1}
              value={formData.contract_duration_months}
              onChange={set('contract_duration_months')}
            />
          </FormField>
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <div className="mt-1.5">
              <Select
                value={formData.contract_status || 'active'}
                onValueChange={(v) => setFormData((p) => ({ ...p, contract_status: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                  <SelectItem value="terminated">Terminated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </Section>

      {/* ----- Target periods ----- */}
      <Section
        title="Target periods"
        action={
          <Button type="button" variant="outline" size="sm" onClick={addTargetPeriod}>
            <Plus className="h-4 w-4" /> Add period
          </Button>
        }
      >
        {formData.target_periods.length === 0 ? (
          <p className="text-sm text-muted-foreground">No target periods set.</p>
        ) : (
          <div className="space-y-3">
            {formData.target_periods.map((tp, i) => (
              <div
                key={i}
                className="grid grid-cols-1 md:grid-cols-[1fr,1fr,1fr,1fr,auto] gap-2 items-end p-3 border border-border rounded-md"
              >
                <FormField label="Period name">
                  <Input
                    value={tp.period_name}
                    onChange={(e) => updateTargetPeriod(i, 'period_name', e.target.value)}
                  />
                </FormField>
                <FormField label="Start">
                  <Input
                    type="date"
                    value={tp.start_date}
                    onChange={(e) => updateTargetPeriod(i, 'start_date', e.target.value)}
                  />
                </FormField>
                <FormField label="End">
                  <Input
                    type="date"
                    value={tp.end_date}
                    onChange={(e) => updateTargetPeriod(i, 'end_date', e.target.value)}
                  />
                </FormField>
                <FormField label="Target amount">
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={tp.target_amount}
                    onChange={(e) => updateTargetPeriod(i, 'target_amount', e.target.value)}
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeTargetPeriod(i)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  aria-label="Remove period"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* ----- Territories ----- */}
      <Section title="Territories">
        <div ref={territoryRef} className="relative">
          <Label className="text-sm font-medium">Add territory</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              value={territoryInput}
              onChange={(e) => handleTerritoryInput(e.target.value)}
              placeholder="Start typing a country name…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (territorySuggestions[0]) addTerritory(territorySuggestions[0]);
                }
              }}
            />
          </div>
          {territorySuggestions.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto border border-border bg-background rounded-md shadow-md">
              {territorySuggestions.map((c) => (
                <li
                  key={c.country_code}
                  className="px-3 py-2 text-sm cursor-pointer hover:bg-muted"
                  onClick={() => addTerritory(c)}
                >
                  {c.country_name}{' '}
                  <span className="text-xs text-muted-foreground">({c.country_code})</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {formData.territories.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-2">
            {formData.territories.map((code) => {
              const country = allCountries.find((c) => c.country_code === code);
              return (
                <span
                  key={code}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-border rounded-md bg-muted"
                >
                  {country?.country_name || code}
                  <button
                    type="button"
                    onClick={() => removeTerritory(code)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${country?.country_name || code}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </Section>
    </AdminFormShell>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h3>
          {action}
        </div>
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
            <SelectValue placeholder="Choose…" />
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
