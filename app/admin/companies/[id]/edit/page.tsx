'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '../../../../../lib/supabaseClient';
import AdminLayout from '../../../../components/AdminLayout';
import InnerPageShell from '../../../../components/ui/InnerPageShell';
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
  // Contract fields
  contract_execution_date: string;
  contract_duration_months: string;
  contract_status: string;
  // Target periods
  target_periods: TargetPeriod[];
  // Territories
  territories: string[];
}

interface Option {
  id: string;
  name: string;
}

interface SupportFundOption {
  id: string;
  percent: number;
}

interface Territory {
  id: string;
  country_code: string;
  country_name: string;
}

interface TargetPeriod {
  id?: string;
  period_name: string;
  start_date: string;
  end_date: string;
  target_amount: string;
}

export default function EditCompanyPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as string;
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [options, setOptions] = useState({
    supportFunds: [] as SupportFundOption[],
    subsidiaries: [] as Option[],
    classes: [] as Option[],
    locations: [] as Option[],
    incoterms: [] as Option[],
    paymentTerms: [] as Option[]
  });

  const [territories, setTerritories] = useState<Territory[]>([]);
  const [territoryInput, setTerritoryInput] = useState('');
  const [territorySuggestions, setTerritorySuggestions] = useState<{code: string, name: string}[]>([]);
  const [allCountries, setAllCountries] = useState<{code: string, name: string}[]>([]);

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
    ship_to_country: '',
    // Contract fields
    contract_execution_date: '',
    contract_duration_months: '36',
    contract_status: 'active',
    // Target periods
    target_periods: [],
    // Territories
    territories: []
  });

  useEffect(() => {
    if (companyId) {
      fetchCompany();
      fetchOptions();
      fetchCountries();
    }
  }, [companyId]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.territory-input-container')) {
        setTerritorySuggestions([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchCompany = async () => {
    try {
      // Fetch company data
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .single();

      if (error) throw error;

      // Fetch territories
      const { data: territoriesData, error: territoriesError } = await supabase
        .from('company_territories')
        .select('*')
        .eq('company_id', companyId);

      if (territoriesError) throw territoriesError;

      // Fetch target periods
      const { data: targetPeriodsData, error: targetPeriodsError } = await supabase
        .from('target_periods')
        .select('*')
        .eq('company_id', companyId)
        .order('start_date', { ascending: true });

      if (targetPeriodsError) throw targetPeriodsError;

      setFormData({
        company_name: data.company_name || '',
        netsuite_number: data.netsuite_number || '',
        support_fund_id: data.support_fund_id || '',
        subsidiary_id: data.subsidiary_id || '',
        class_id: data.class_id || '',
        location_id: data.location_id || '',
        ship_to: data.ship_to || '',
        incoterm_id: data.incoterm_id || '',
        payment_terms_id: data.payment_terms_id || '',
        company_address: data.company_address || '',
        company_email: data.company_email || '',
        company_phone: data.company_phone || '',
        company_tax_number: data.company_tax_number || '',
        ship_to_contact_name: data.ship_to_contact_name || '',
        ship_to_contact_email: data.ship_to_contact_email || '',
        ship_to_contact_phone: data.ship_to_contact_phone || '',
        ship_to_street_line_1: data.ship_to_street_line_1 || '',
        ship_to_street_line_2: data.ship_to_street_line_2 || '',
        ship_to_city: data.ship_to_city || '',
        ship_to_state: data.ship_to_state || '',
        ship_to_postal_code: data.ship_to_postal_code || '',
        ship_to_country: data.ship_to_country || '',
        // Contract fields
        contract_execution_date: data.contract_execution_date || '',
        contract_duration_months: data.contract_duration_months?.toString() || '36',
        contract_status: data.contract_status || 'active',
        // Target periods
        target_periods: targetPeriodsData?.map(tp => ({
          id: tp.id,
          period_name: tp.period_name,
          start_date: tp.start_date,
          end_date: tp.end_date,
          target_amount: tp.target_amount.toString()
        })) || [],
        // Territories
        territories: territoriesData?.map(t => t.country_code) || []
      });

      setTerritories(territoriesData || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setInitialLoading(false);
    }
  };

  const fetchOptions = async () => {
    try {
      const [supportFunds, subsidiaries, classes, locations, incoterms, paymentTerms] = await Promise.all([
        supabase.from('support_fund_levels').select('id, percent').order('percent'),
        supabase.from('subsidiaries').select('id, name').order('name'),
        supabase.from('classes').select('id, name').order('name'),
        supabase.from('Locations').select('id, location_name').order('location_name'),
        supabase.from('incoterms').select('id, name').order('name'),
        supabase.from('payment_terms').select('id, name').order('name')
      ]);

      setOptions({
        supportFunds: supportFunds.data || [],
        subsidiaries: subsidiaries.data || [],
        classes: classes.data || [],
        locations: (locations.data || []).map(loc => ({ id: loc.id, name: loc.location_name })),
        incoterms: incoterms.data || [],
        paymentTerms: paymentTerms.data || []
      });
    } catch (err: any) {
      setError('Failed to load form options: ' + (err as Error).message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Update company data
      const { error } = await supabase
        .from('companies')
        .update({
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
          ship_to_country: formData.ship_to_country || null,
          // Contract fields
          contract_execution_date: formData.contract_execution_date || null,
          contract_duration_months: formData.contract_duration_months ? parseInt(formData.contract_duration_months) : null,
          contract_status: formData.contract_status || 'active'
        })
        .eq('id', companyId);

      if (error) {
        if (error.code === '23505') { // Unique constraint violation
          setError(`A company with NetSuite number "${formData.netsuite_number}" already exists. Please use a different NetSuite number.`);
        } else {
          throw error;
        }
        return;
      }

      // Update territories
      // First, delete existing territories
      const { error: deleteError } = await supabase
        .from('company_territories')
        .delete()
        .eq('company_id', companyId);

      if (deleteError) throw deleteError;

      // Then insert new territories
      if (formData.territories.length > 0) {
        const territoriesToInsert = formData.territories.map(countryCode => {
          const country = allCountries.find(c => c.code === countryCode);
          return {
            company_id: companyId,
            country_code: countryCode,
            country_name: country?.name || countryCode
          };
        });

        const { error: insertError } = await supabase
          .from('company_territories')
          .insert(territoriesToInsert);

        if (insertError) throw insertError;
      }

      // Update target periods
      // First, delete existing target periods
      const { error: deleteTargetsError } = await supabase
        .from('target_periods')
        .delete()
        .eq('company_id', companyId);

      if (deleteTargetsError) throw deleteTargetsError;

      // Then insert new target periods
      if (formData.target_periods.length > 0) {
        const targetPeriodsToInsert = formData.target_periods.map(period => ({
          company_id: companyId,
          period_name: period.period_name,
          start_date: period.start_date,
          end_date: period.end_date,
          target_amount: parseFloat(period.target_amount) || 0
        }));

        const { error: insertTargetsError } = await supabase
          .from('target_periods')
          .insert(targetPeriodsToInsert);

        if (insertTargetsError) throw insertTargetsError;
      }

      router.push(`/admin/companies/${companyId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Territory autocomplete functions
  const fetchCountries = async () => {
    console.log('Fetching countries...');
    try {
      const { data, error } = await supabase.rpc('get_countries_list');
      if (error) {
        console.warn('get_countries_list function not found, using fallback list:', error);
        // Fallback to a basic list if the function doesn't exist
        const fallbackCountries = [
          { code: 'US', name: 'United States' },
          { code: 'CA', name: 'Canada' },
          { code: 'MX', name: 'Mexico' },
          { code: 'GB', name: 'United Kingdom' },
          { code: 'DE', name: 'Germany' },
          { code: 'FR', name: 'France' },
          { code: 'IT', name: 'Italy' },
          { code: 'ES', name: 'Spain' },
          { code: 'AU', name: 'Australia' },
          { code: 'JP', name: 'Japan' },
          { code: 'CN', name: 'China' },
          { code: 'IN', name: 'India' },
          { code: 'BR', name: 'Brazil' },
          { code: 'AR', name: 'Argentina' },
          { code: 'CL', name: 'Chile' },
          { code: 'CO', name: 'Colombia' },
          { code: 'PE', name: 'Peru' },
          { code: 'ZA', name: 'South Africa' },
          { code: 'NG', name: 'Nigeria' },
          { code: 'EG', name: 'Egypt' },
          { code: 'AE', name: 'United Arab Emirates' },
          { code: 'SA', name: 'Saudi Arabia' },
          { code: 'TR', name: 'Turkey' },
          { code: 'RU', name: 'Russia' },
          { code: 'KR', name: 'South Korea' },
          { code: 'SG', name: 'Singapore' },
          { code: 'MY', name: 'Malaysia' },
          { code: 'TH', name: 'Thailand' },
          { code: 'ID', name: 'Indonesia' },
          { code: 'PH', name: 'Philippines' },
          { code: 'VN', name: 'Vietnam' },
          { code: 'NL', name: 'Netherlands' },
          { code: 'BE', name: 'Belgium' },
          { code: 'CH', name: 'Switzerland' },
          { code: 'AT', name: 'Austria' },
          { code: 'SE', name: 'Sweden' },
          { code: 'NO', name: 'Norway' },
          { code: 'DK', name: 'Denmark' },
          { code: 'FI', name: 'Finland' },
          { code: 'PL', name: 'Poland' },
          { code: 'CZ', name: 'Czech Republic' },
          { code: 'HU', name: 'Hungary' },
          { code: 'RO', name: 'Romania' },
          { code: 'BG', name: 'Bulgaria' },
          { code: 'GR', name: 'Greece' },
          { code: 'PT', name: 'Portugal' },
          { code: 'IE', name: 'Ireland' },
          { code: 'NZ', name: 'New Zealand' },
          { code: 'IL', name: 'Israel' },
          { code: 'JO', name: 'Jordan' },
          { code: 'LB', name: 'Lebanon' },
          { code: 'KW', name: 'Kuwait' },
          { code: 'QA', name: 'Qatar' },
          { code: 'BH', name: 'Bahrain' },
          { code: 'OM', name: 'Oman' },
          { code: 'YE', name: 'Yemen' },
          { code: 'IQ', name: 'Iraq' },
          { code: 'IR', name: 'Iran' },
          { code: 'AF', name: 'Afghanistan' },
          { code: 'PK', name: 'Pakistan' },
          { code: 'BD', name: 'Bangladesh' },
          { code: 'LK', name: 'Sri Lanka' },
          { code: 'MV', name: 'Maldives' },
          { code: 'NP', name: 'Nepal' },
          { code: 'BT', name: 'Bhutan' },
          { code: 'MM', name: 'Myanmar' },
          { code: 'LA', name: 'Laos' },
          { code: 'KH', name: 'Cambodia' },
          { code: 'MN', name: 'Mongolia' },
          { code: 'KP', name: 'North Korea' },
          { code: 'TW', name: 'Taiwan' },
          { code: 'HK', name: 'Hong Kong' },
          { code: 'MO', name: 'Macao' },
          { code: 'BN', name: 'Brunei' },
          { code: 'TL', name: 'Timor-Leste' },
          { code: 'FJ', name: 'Fiji' },
          { code: 'PG', name: 'Papua New Guinea' },
          { code: 'SB', name: 'Solomon Islands' },
          { code: 'VU', name: 'Vanuatu' },
          { code: 'NC', name: 'New Caledonia' },
          { code: 'PF', name: 'French Polynesia' },
          { code: 'WS', name: 'Samoa' },
          { code: 'TO', name: 'Tonga' },
          { code: 'KI', name: 'Kiribati' },
          { code: 'TV', name: 'Tuvalu' },
          { code: 'NR', name: 'Nauru' },
          { code: 'PW', name: 'Palau' },
          { code: 'FM', name: 'Micronesia' },
          { code: 'MH', name: 'Marshall Islands' },
          { code: 'CK', name: 'Cook Islands' },
          { code: 'NU', name: 'Niue' },
          { code: 'TK', name: 'Tokelau' },
          { code: 'WF', name: 'Wallis and Futuna' },
          { code: 'AS', name: 'American Samoa' },
          { code: 'GU', name: 'Guam' },
          { code: 'MP', name: 'Northern Mariana Islands' },
          { code: 'UM', name: 'United States Minor Outlying Islands' }
        ];
        setAllCountries(fallbackCountries);
        console.log('Using fallback countries:', fallbackCountries.length);
        return;
      }
      setAllCountries(data || []);
      console.log('Countries loaded from database:', data?.length || 0);
    } catch (error) {
      console.error('Error fetching countries:', error);
      // Set empty array as fallback
      setAllCountries([]);
    }
  };

  const handleTerritoryInputChange = (value: string) => {
    console.log('Input changed:', value);
    console.log('All countries:', allCountries?.length || 0);
    console.log('Sample country:', allCountries?.[0]);
    setTerritoryInput(value);
    if (value.trim().length > 0 && allCountries && allCountries.length > 0) {
      const searchTerm = value.toLowerCase().trim();
      const filtered = allCountries.filter(country => {
        if (!country || !country.name) return false;
        const countryName = country.name.toLowerCase();
        // Check if the search term matches the beginning of the country name
        // or if it's contained within the country name
        return (countryName.startsWith(searchTerm) || countryName.includes(searchTerm)) &&
               !formData.territories.includes(country.code);
      })
      .sort((a, b) => {
        // Prioritize exact matches at the beginning
        const aStarts = a.name.toLowerCase().startsWith(searchTerm);
        const bStarts = b.name.toLowerCase().startsWith(searchTerm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8); // Limit to 8 suggestions for better UX
      console.log('Filtered suggestions:', filtered);
      setTerritorySuggestions(filtered);
    } else {
      console.log('No suggestions - countries not loaded or empty input');
      setTerritorySuggestions([]);
    }
  };

  const selectTerritorySuggestion = (country: {code: string, name: string}) => {
    setFormData(prev => ({
      ...prev,
      territories: [...prev.territories, country.code]
    }));
    setTerritoryInput('');
    setTerritorySuggestions([]);
  };

  const addTerritory = () => {
    if (!territoryInput.trim() || !allCountries || allCountries.length === 0) return;
    
    const searchTerm = territoryInput.toLowerCase().trim();
    
    // Try to find exact match first
    const exactMatch = allCountries.find(country =>
      country && country.name && country.name.toLowerCase() === searchTerm
    );
    
    if (exactMatch && !formData.territories.includes(exactMatch.code)) {
      setFormData(prev => ({
        ...prev,
        territories: [...prev.territories, exactMatch.code]
      }));
      setTerritoryInput('');
      setTerritorySuggestions([]);
      return;
    }
    
    // If no exact match, try to find the best partial match
    const bestMatch = allCountries.find(country => {
      if (!country || !country.name) return false;
      const countryName = country.name.toLowerCase();
      return countryName.startsWith(searchTerm) && 
             !formData.territories.includes(country.code);
    });
    
    if (bestMatch) {
      setFormData(prev => ({
        ...prev,
        territories: [...prev.territories, bestMatch.code]
      }));
      setTerritoryInput('');
      setTerritorySuggestions([]);
      return;
    }
    
    // If still no match, use first suggestion if available
    if (territorySuggestions.length > 0) {
      selectTerritorySuggestion(territorySuggestions[0]);
    }
  };

  const removeTerritory = (countryCode: string) => {
    setFormData(prev => ({
      ...prev,
      territories: prev.territories.filter(code => code !== countryCode)
    }));
  };

  const addTargetPeriod = () => {
    const contractDuration = parseInt(formData.contract_duration_months) || 0;
    const currentPeriods = formData.target_periods.length;
    
    // Block adding if contract duration is smaller than number of periods
    if (contractDuration <= currentPeriods * 12) {
      alert(`Cannot add more target periods. Contract duration (${contractDuration} months) must be greater than ${currentPeriods * 12} months.`);
      return;
    }

    const newPeriod: TargetPeriod = {
      period_name: `Year ${currentPeriods + 1}`,
      start_date: '',
      end_date: '',
      target_amount: ''
    };

    setFormData(prev => ({
      ...prev,
      target_periods: [...prev.target_periods, newPeriod]
    }));
  };

  const removeTargetPeriod = (index: number) => {
    setFormData(prev => ({
      ...prev,
      target_periods: prev.target_periods.filter((_, i) => i !== index)
    }));
  };

  const updateTargetPeriod = (index: number, field: keyof TargetPeriod, value: string) => {
    setFormData(prev => ({
      ...prev,
      target_periods: prev.target_periods.map((period, i) => 
        i === index ? { ...period, [field]: value } : period
      )
    }));
  };

  if (initialLoading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading company...</p>
        </div>
      </AdminLayout>
    );
  }

  if (error && !formData.company_name) {
    return (
      <AdminLayout>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Company Not Found</h1>
            <p className="text-gray-600 mb-4">{error}</p>
            <Link
              href="/admin/companies"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Companies
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <InnerPageShell
          title="Edit Company"
          breadcrumbs={[{ label: 'Companies', href: '/admin/companies' }, { label: 'Edit' }]}
          actions={<Link href={`/admin/companies/${companyId}`} className="text-gray-600 hover:text-gray-800">← Back</Link>}
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
              />
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

          {/* Company Information Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Company Information</h3>
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

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Email
                  </label>
                  <input
                    type="email"
                    name="company_email"
                    value={formData.company_email}
                    onChange={handleChange}
                    placeholder="info@company.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Company Phone
                  </label>
                  <input
                    type="tel"
                    name="company_phone"
                    value={formData.company_phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Tax Number (VAT)
                </label>
                <input
                  type="text"
                  name="company_tax_number"
                  value={formData.company_tax_number}
                  onChange={handleChange}
                  placeholder="Tax/VAT number"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>
            </div>
          </div>

          {/* Ship To Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Ship To Information</h3>
            <div className="grid grid-cols-1 gap-6">
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
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ship To Contact Name
                  </label>
                  <input
                    type="text"
                    name="ship_to_contact_name"
                    value={formData.ship_to_contact_name}
                    onChange={handleChange}
                    placeholder="Contact person name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ship To Contact Email
                  </label>
                  <input
                    type="email"
                    name="ship_to_contact_email"
                    value={formData.ship_to_contact_email}
                    onChange={handleChange}
                    placeholder="contact@company.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Ship To Contact Phone
                  </label>
                  <input
                    type="tel"
                    name="ship_to_contact_phone"
                    value={formData.ship_to_contact_phone}
                    onChange={handleChange}
                    placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                  />
                </div>
              </div>

              {/* Structured Address Fields for 3PL Export */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Structured Address (for 3PL Export)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Street Line 1
                    </label>
                    <input
                      type="text"
                      name="ship_to_street_line_1"
                      value={formData.ship_to_street_line_1}
                      onChange={handleChange}
                      placeholder="123 Main Street"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Street Line 2
                    </label>
                    <input
                      type="text"
                      name="ship_to_street_line_2"
                      value={formData.ship_to_street_line_2}
                      onChange={handleChange}
                      placeholder="Suite 100"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      name="ship_to_city"
                      value={formData.ship_to_city}
                      onChange={handleChange}
                      placeholder="New York"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      State/Province
                    </label>
                    <input
                      type="text"
                      name="ship_to_state"
                      value={formData.ship_to_state}
                      onChange={handleChange}
                      placeholder="NY"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Postal Code
                    </label>
                    <input
                      type="text"
                      name="ship_to_postal_code"
                      value={formData.ship_to_postal_code}
                      onChange={handleChange}
                      placeholder="10001"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Country
                    </label>
                    <input
                      type="text"
                      name="ship_to_country"
                      value={formData.ship_to_country}
                      onChange={handleChange}
                      placeholder="United States"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black text-sm"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  These structured fields are used for 3PL system export. Fill them in addition to the Ship To Address above.
                </p>
              </div>
            </div>
          </div>

          {/* Contract Information Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Contract Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contract Execution Date
                </label>
                <input
                  type="date"
                  name="contract_execution_date"
                  value={formData.contract_execution_date}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contract Duration (Months)
                </label>
                <input
                  type="number"
                  name="contract_duration_months"
                  value={formData.contract_duration_months}
                  onChange={handleChange}
                  placeholder="36"
                  min="1"
                  max="120"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter number of months (e.g., 37, 40, 48)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Contract Status
                </label>
                <select
                  name="contract_status"
                  value={formData.contract_status}
                  onChange={handleChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="active">Active</option>
                  <option value="expired">Expired</option>
                  <option value="suspended">Suspended</option>
                  <option value="terminated">Terminated</option>
                </select>
              </div>
            </div>
          </div>

          {/* Target Periods Section */}
          <div className="border-t pt-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Annual Target Periods</h3>
              <button
                type="button"
                onClick={addTargetPeriod}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition flex items-center space-x-2"
              >
                <span>+</span>
                <span>Add Target Period</span>
              </button>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Define target periods for each 12-month cycle. Contract duration must be greater than the number of periods × 12 months.
            </p>
            
            {formData.target_periods.length === 0 ? (
              <div className="text-center py-8 bg-gray-50 rounded-lg">
                <p className="text-gray-500">No target periods defined yet.</p>
                <p className="text-sm text-gray-400 mt-1">Click "Add Target Period" to get started.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {formData.target_periods.map((period, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-medium text-gray-900">Target Period {index + 1}</h4>
                      <button
                        type="button"
                        onClick={() => removeTargetPeriod(index)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Remove
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Period Name
                        </label>
                        <input
                          type="text"
                          value={period.period_name}
                          onChange={(e) => updateTargetPeriod(index, 'period_name', e.target.value)}
                          placeholder="Year 1"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={period.start_date}
                          onChange={(e) => updateTargetPeriod(index, 'start_date', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={period.end_date}
                          onChange={(e) => updateTargetPeriod(index, 'end_date', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Target Amount ($)
                        </label>
                        <input
                          type="number"
                          value={period.target_amount}
                          onChange={(e) => updateTargetPeriod(index, 'target_amount', e.target.value)}
                          placeholder="0.00"
                          step="0.01"
                          min="0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Territories Section */}
          <div className="border-t pt-6 mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Exclusive Territories</h3>
            <p className="text-sm text-gray-600 mb-4">
              Add countries where this company has exclusive distribution rights.
            </p>
            
            {/* Add Territory Input */}
            <div className="flex gap-2 mb-4 relative territory-input-container">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Type country name..."
                  value={territoryInput}
                  onChange={(e) => handleTerritoryInputChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addTerritory();
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
                />
                {territorySuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto mt-1">
                    {territorySuggestions.map((country) => (
                      <div
                        key={country.code}
                        onClick={() => selectTerritorySuggestion(country)}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm border-b border-gray-100 last:border-b-0"
                      >
                        {country.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={addTerritory}
                disabled={!territoryInput.trim()}
                className="px-4 py-2 bg-black text-white rounded-md hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>

            {/* Selected Territories */}
            {formData.territories.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Selected Territories:</p>
                <div className="flex flex-wrap gap-2">
                  {formData.territories.map((territoryCode) => {
                    const territory = territories.find(t => t.country_code === territoryCode);
                    return (
                      <div
                        key={territoryCode}
                        className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-md px-3 py-1"
                      >
                        <span className="text-sm text-blue-800">
                          {territory?.country_name || territoryCode}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeTerritory(territoryCode)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex space-x-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-black text-white px-6 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Company'}
            </button>
            <Link
              href={`/admin/companies/${companyId}`}
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
