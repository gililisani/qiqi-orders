'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../../lib/supabaseClient';
import AdminLayout from '../../../components/AdminLayout';
import InnerPageShell from '../../../components/ui/InnerPageShell';
import Link from 'next/link';

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

export default function NewCompanyPage() {
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
    payment_terms_id: ''
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
          payment_terms_id: formData.payment_terms_id || null
        }]);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          setError(`A company with NetSuite number "${formData.netsuite_number}" already exists. Please use a different NetSuite number.`);
        } else {
          throw error;
        }
      } else {
        window.location.href = '/admin/companies';
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

  return (
    <AdminLayout>
      <div className="p-6">
        <InnerPageShell
          title="Add New Company"
          breadcrumbs={[{ label: 'Companies', href: '/admin/companies' }, { label: 'New' }]}
          actions={<Link href="/admin/companies" className="text-gray-600 hover:text-gray-800">← Back</Link>}
        >

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name *
              </label>
              <input
                type="text"
                name="company_name"
                value={formData.company_name}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                NetSuite Number *
              </label>
              <input
                type="text"
                name="netsuite_number"
                value={formData.netsuite_number}
                onChange={handleChange}
                required
                className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                  netsuiteError 
                    ? 'border-red-300 focus:ring-red-500' 
                    : 'border-gray-300 focus:ring-black'
                }`}
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
                Subsidiary
              </label>
              <select
                name="subsidiary_id"
                value={formData.subsidiary_id}
                onChange={handleChange}
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
                Class
              </label>
              <select
                name="class_id"
                value={formData.class_id}
                onChange={handleChange}
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
                Location
              </label>
              <select
                name="location_id"
                value={formData.location_id}
                onChange={handleChange}
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

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Incoterm
              </label>
              <select
                name="incoterm_id"
                value={formData.incoterm_id}
                onChange={handleChange}
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
                Payment Terms
              </label>
              <select
                name="payment_terms_id"
                value={formData.payment_terms_id}
                onChange={handleChange}
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

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading || !!netsuiteError}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Company'}
            </button>
            <Link
              href="/admin/companies"
              className="bg-gray-300 text-gray-700 px-6 py-2 rounded hover:bg-gray-400 transition"
            >
              Cancel
            </Link>
          </div>
        </form>
        </InnerPageShell>
      </div>
    </AdminLayout>
  );
}
