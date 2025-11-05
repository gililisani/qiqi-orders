'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardBody,
  CardHeader,
  Input,
  Button,
  Typography,
} from '../../../components/MaterialTailwind';

interface FormData {
  company_name: string;
  netsuite_number: string;
  support_fund_id: string;
  subsidiary_id: string;
  class_id: string;
  location_id: string;
  ship_to: string;
  incoterm_id: string;
  payment_terms_id: string;
  company_address: string;
  company_email: string;
  company_phone: string;
  company_tax_number: string;
  ship_to_contact_name: string;
  ship_to_contact_email: string;
  ship_to_contact_phone: string;
  ship_to_street_line_1: string;
  ship_to_street_line_2: string;
  ship_to_city: string;
  ship_to_state: string;
  ship_to_postal_code: string;
  ship_to_country: string;
}

interface Option {
  id: string;
  name: string;
  percent?: number;
}

interface SupportFundOption {
  id: string;
  percent: number;
}

const defaultProps = {
  placeholder: undefined,
  onPointerEnterCapture: undefined,
  onPointerLeaveCapture: undefined,
  crossOrigin: undefined,
};

export default function NewCompanyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [options, setOptions] = useState({
    supportFunds: [] as SupportFundOption[],
    subsidiaries: [] as Option[],
    classes: [] as Option[],
    locations: [] as Option[],
    incoterms: [] as Option[],
    paymentTerms: [] as Option[]
  });

  const [formData, setFormData] = useState<FormData>({
    company_name: '',
    netsuite_number: '',
    support_fund_id: '',
    subsidiary_id: '',
    class_id: '',
    location_id: '',
    ship_to: '',
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
    ship_to_country: ''
  });
  const [netsuiteError, setNetsuiteError] = useState('');

  useEffect(() => {
    fetchOptions();
  }, []);

  const fetchOptions = async () => {
    try {
      console.log('Fetching options...');
      
      const [supportFunds, subsidiaries, classes, locations, incoterms, paymentTerms] = await Promise.all([
        supabase.from('support_fund_levels').select('id, percent').order('percent'),
        supabase.from('subsidiaries').select('id, name').order('name'),
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('Locations').select('id, location_name').order('location_name'),
        supabase.from('incoterms').select('id, name').order('name'),
        supabase.from('payment_terms').select('id, name').order('name')
      ]);

      console.log('Query results:', {
        supportFunds: supportFunds,
        subsidiaries: subsidiaries,
        classes: classes,
        locations: locations
      });

      setOptions({
        supportFunds: supportFunds.data || [],
        subsidiaries: subsidiaries.data || [],
        classes: classes.data || [],
        locations: (locations.data || []).map(loc => ({ id: loc.id, name: loc.location_name })),
        incoterms: incoterms.data || [],
        paymentTerms: paymentTerms.data || []
      });
    } catch (err: any) {
      console.error('Error fetching options:', err);
      setError('Failed to load form options: ' + err.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Check if NetSuite number already exists
      const { data: existingCompany, error: checkError } = await supabase
        .from('companies')
        .select('id, company_name, netsuite_number')
        .eq('netsuite_number', formData.netsuite_number)
        .single();

      if (checkError && checkError.code !== 'PGRST116') { // PGRST116 = no rows found
        throw checkError;
      }

      if (existingCompany) {
        setError(`A company with NetSuite number "${formData.netsuite_number}" already exists (${existingCompany.company_name}). Please use a different NetSuite number.`);
        setLoading(false);
        return;
      }

      // Create the company
      const { error } = await supabase
        .from('companies')
        .insert([{
          company_name: formData.company_name,
          netsuite_number: formData.netsuite_number,
          support_fund_id: formData.support_fund_id || null,
          subsidiary_id: formData.subsidiary_id || null,
          class_id: formData.class_id || null,
          location_id: formData.location_id || null,
          ship_to: formData.ship_to || null,
          incoterm_id: formData.incoterm_id || null,
          payment_terms_id: formData.payment_terms_id || null,
          company_address: formData.company_address || null,
          company_email: formData.company_email || null,
          company_phone: formData.company_phone || null,
          company_tax_number: formData.company_tax_number || null,
          ship_to_contact_name: formData.ship_to_contact_name || null,
          ship_to_contact_email: formData.ship_to_contact_email || null,
          ship_to_contact_phone: formData.ship_to_contact_phone || null,
          ship_to_street_line_1: formData.ship_to_street_line_1 || null,
          ship_to_street_line_2: formData.ship_to_street_line_2 || null,
          ship_to_city: formData.ship_to_city || null,
          ship_to_state: formData.ship_to_state || null,
          ship_to_postal_code: formData.ship_to_postal_code || null,
          ship_to_country: formData.ship_to_country || null
        }]);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          setError(`A company with NetSuite number "${formData.netsuite_number}" already exists. Please use a different NetSuite number.`);
        } else {
          throw error;
        }
      } else {
        router.push('/admin/companies');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkNetSuiteNumber = async (netsuiteNumber: string) => {
    if (!netsuiteNumber.trim()) {
      setNetsuiteError('');
      return;
    }

    try {
      const { data: existingCompany, error } = await supabase
        .from('companies')
        .select('id, company_name, netsuite_number')
        .eq('netsuite_number', netsuiteNumber)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        console.error('Error checking NetSuite number:', error);
        return;
      }

      if (existingCompany) {
        setNetsuiteError(`NetSuite number "${netsuiteNumber}" is already used by "${existingCompany.company_name}"`);
      } else {
        setNetsuiteError('');
      }
    } catch (err) {
      console.error('Error checking NetSuite number:', err);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check NetSuite number in real-time
    if (name === 'netsuite_number') {
      checkNetSuiteNumber(value);
    }
  };

  const handleInputChange = (name: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    // Check NetSuite number in real-time
    if (name === 'netsuite_number') {
      checkNetSuiteNumber(value);
    }
  };

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">Add New Company</h2>
        <Link href="/admin/companies" className="text-gray-600 hover:text-gray-800">
          ← Back to Companies
        </Link>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="space-y-6">
          {/* Basic Information */}
          <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                Basic Information
              </Typography>
            </CardHeader>
            <CardBody className="px-4 pt-6" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Input
                  label="Company Name"
                  name="company_name"
                  value={formData.company_name}
                  onChange={(e) => handleInputChange('company_name', e.target.value)}
                  required
                  {...defaultProps}
                />
                <div>
                  <Input
                    label="NetSuite Number"
                    name="netsuite_number"
                    value={formData.netsuite_number}
                    onChange={(e) => handleInputChange('netsuite_number', e.target.value)}
                    required
                    className={netsuiteError ? 'border-red-300' : ''}
                    {...defaultProps}
                  />
                  {netsuiteError && (
                    <p className="mt-1 text-sm text-red-600">{netsuiteError}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Support Fund Percentage
                  </label>
                  <select
                    name="support_fund_id"
                    value={formData.support_fund_id}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select Support Fund %</option>
                    {options.supportFunds.map((fund) => (
                      <option key={fund.id} value={fund.id}>
                        {fund.percent}%
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Subsidiary *
                  </label>
                  <select
                    name="subsidiary_id"
                    value={formData.subsidiary_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select Subsidiary</option>
                    {options.subsidiaries.map((subsidiary) => (
                      <option key={subsidiary.id} value={subsidiary.id}>
                        {subsidiary.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Class *
                  </label>
                  <select
                    name="class_id"
                    value={formData.class_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select Class</option>
                    {options.classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Location *
                  </label>
                  <select
                    name="location_id"
                    value={formData.location_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select Location</option>
                    {options.locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Financial Information */}
          <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                Financial Information
              </Typography>
            </CardHeader>
            <CardBody className="px-4 pt-6" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Incoterm *
                  </label>
                  <select
                    name="incoterm_id"
                    value={formData.incoterm_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select Incoterm</option>
                    {options.incoterms.map((incoterm) => (
                      <option key={incoterm.id} value={incoterm.id}>
                        {incoterm.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Payment Terms *
                  </label>
                  <select
                    name="payment_terms_id"
                    value={formData.payment_terms_id}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  >
                    <option value="">Select Payment Terms</option>
                    {options.paymentTerms.map((term) => (
                      <option key={term.id} value={term.id}>
                        {term.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Company Information */}
          <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                Company Information
              </Typography>
            </CardHeader>
            <CardBody className="px-4 pt-6" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Address
                  </label>
                  <textarea
                    name="company_address"
                    value={formData.company_address}
                    onChange={handleChange}
                    rows={3}
                    placeholder="Company main address..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
                <div className="space-y-4">
                  <Input
                    label="Company Email"
                    name="company_email"
                    type="email"
                    value={formData.company_email}
                    onChange={(e) => handleInputChange('company_email', e.target.value)}
                    placeholder="info@company.com"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <Input
                    label="Company Phone"
                    name="company_phone"
                    type="tel"
                    value={formData.company_phone}
                    onChange={(e) => handleInputChange('company_phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    label="Company Tax Number (VAT)"
                    name="company_tax_number"
                    value={formData.company_tax_number}
                    onChange={(e) => handleInputChange('company_tax_number', e.target.value)}
                    placeholder="Tax/VAT number"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Ship To Information */}
          <Card className="shadow-sm" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
            <CardHeader floated={false} shadow={false} className="rounded-none" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <Typography variant="h6" color="blue-gray" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                Ship To Information
              </Typography>
            </CardHeader>
            <CardBody className="px-4 pt-6" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ship To Address
                  </label>
                  <textarea
                    name="ship_to"
                    value={formData.ship_to}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Enter shipping address and instructions..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Input
                    label="Ship To Contact Name"
                    name="ship_to_contact_name"
                    value={formData.ship_to_contact_name}
                    onChange={(e) => handleInputChange('ship_to_contact_name', e.target.value)}
                    placeholder="Contact person name"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <Input
                    label="Ship To Contact Email"
                    name="ship_to_contact_email"
                    type="email"
                    value={formData.ship_to_contact_email}
                    onChange={(e) => handleInputChange('ship_to_contact_email', e.target.value)}
                    placeholder="contact@company.com"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                  <Input
                    label="Ship To Contact Phone"
                    name="ship_to_contact_phone"
                    type="tel"
                    value={formData.ship_to_contact_phone}
                    onChange={(e) => handleInputChange('ship_to_contact_phone', e.target.value)}
                    placeholder="+1 (555) 123-4567"
                    onPointerEnterCapture={undefined}
                    onPointerLeaveCapture={undefined}
                    crossOrigin={undefined}
                  />
                </div>

                {/* Structured Address Fields for 3PL Export */}
                <div className="border-t pt-4 mt-4">
                  <Typography variant="small" className="font-semibold text-gray-700 mb-3" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    Structured Address (for 3PL Export)
                  </Typography>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Street Line 1"
                      name="ship_to_street_line_1"
                      value={formData.ship_to_street_line_1}
                      onChange={(e) => handleInputChange('ship_to_street_line_1', e.target.value)}
                      placeholder="123 Main Street"
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                    <Input
                      label="Street Line 2"
                      name="ship_to_street_line_2"
                      value={formData.ship_to_street_line_2}
                      onChange={(e) => handleInputChange('ship_to_street_line_2', e.target.value)}
                      placeholder="Suite 100"
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                    <Input
                      label="City"
                      name="ship_to_city"
                      value={formData.ship_to_city}
                      onChange={(e) => handleInputChange('ship_to_city', e.target.value)}
                      placeholder="New York"
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                    <Input
                      label="State/Province"
                      name="ship_to_state"
                      value={formData.ship_to_state}
                      onChange={(e) => handleInputChange('ship_to_state', e.target.value)}
                      placeholder="NY"
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                    <Input
                      label="Postal Code"
                      name="ship_to_postal_code"
                      value={formData.ship_to_postal_code}
                      onChange={(e) => handleInputChange('ship_to_postal_code', e.target.value)}
                      placeholder="10001"
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                    <Input
                      label="Country"
                      name="ship_to_country"
                      value={formData.ship_to_country}
                      onChange={(e) => handleInputChange('ship_to_country', e.target.value)}
                      placeholder="United States"
                      onPointerEnterCapture={undefined}
                      onPointerLeaveCapture={undefined}
                      crossOrigin={undefined}
                    />
                  </div>
                  <Typography variant="small" color="gray" className="mt-2 font-normal" placeholder={undefined} onPointerEnterCapture={undefined} onPointerLeaveCapture={undefined}>
                    These structured fields are used for 3PL system export. Fill them in addition to the Ship To Address above.
                  </Typography>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4 pt-4">
            <Link href="/admin/companies">
              <Button
                variant="outlined"
                color="gray"
                placeholder={undefined}
                onPointerEnterCapture={undefined}
                onPointerLeaveCapture={undefined}
              >
                Cancel
              </Button>
            </Link>
            <Button
              type="submit"
              className="bg-black text-white hover:opacity-90 disabled:opacity-50"
              disabled={loading || !!netsuiteError}
              placeholder={undefined}
              onPointerEnterCapture={undefined}
              onPointerLeaveCapture={undefined}
            >
              {loading ? 'Creating...' : 'Create Company'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
