'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '../../../../lib/supabaseClient';


import InnerPageShell from '../../../components/ui/InnerPageShell';
import Card from '../../../components/ui/Card';
import Link from 'next/link';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund_id: string;
  subsidiary_id: string;
  class_id: string;
  location_id: string;
  ship_to?: string;
  incoterm_id?: string;
  payment_term_id?: string;
  company_address?: string;
  company_email?: string;
  company_phone?: string;
  company_tax_number?: string;
  ship_to_contact_name?: string;
  ship_to_contact_email?: string;
  ship_to_contact_phone?: string;
  ship_to_street_line_1?: string;
  ship_to_street_line_2?: string;
  ship_to_city?: string;
  ship_to_state?: string;
  ship_to_postal_code?: string;
  ship_to_country?: string;
  // Contract fields
  contract_execution_date?: string;
  contract_duration_months?: number;
  contract_status?: string;
  // Related data
  support_fund?: { percent: number };
  subsidiary?: { name: string };
  class?: { name: string };
  location?: { location_name: string };
  incoterm?: { name: string };
  payment_term?: { name: string };
  territories?: Territory[];
  target_periods?: TargetPeriod[];
}

interface Territory {
  id: string;
  country_code: string;
  country_name: string;
}

interface TargetPeriod {
  id: string;
  period_name: string;
  start_date: string;
  end_date: string;
  target_amount: number;
  current_progress: number;
}

interface User {
  id: string;
  name: string;
  email: string;
  enabled: boolean;
  created_at: string;
}

export default function CompanyViewPage() {
  const params = useParams();
  const companyId = params.id as string;
  
  const [company, setCompany] = useState<Company | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userError, setUserError] = useState('');

  useEffect(() => {
    if (companyId) {
      const loadData = async () => {
        setLoading(true);
        setError('');
        try {
          await Promise.all([fetchCompany(), fetchUsers()]);
        } catch (err) {
          console.error('Error loading data:', err);
        } finally {
          setLoading(false);
        }
      };
      loadData();
    }
  }, [companyId]);

  const fetchCompany = async () => {
    try {
      console.log('Fetching company with ID:', companyId);
      
      // Fetch company data
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select(`
          *,
          support_fund:support_fund_levels(percent),
          subsidiary:subsidiaries(name),
          class:classes(name),
          location:Locations(location_name),
          incoterm:incoterms(name),
          payment_term:payment_terms(name)
        `)
        .eq('id', companyId)
        .single();

      if (companyError) {
        console.error('Error fetching company:', companyError);
        throw companyError;
      }

      // Fetch territories
      const { data: territoriesData, error: territoriesError } = await supabase
        .from('company_territories')
        .select('*')
        .eq('company_id', companyId);

      if (territoriesError) {
        console.error('Error fetching territories:', territoriesError);
        throw territoriesError;
      }

      // Fetch target periods
      const { data: targetPeriodsData, error: targetPeriodsError } = await supabase
        .from('target_periods')
        .select('*')
        .eq('company_id', companyId)
        .order('start_date', { ascending: true });

      if (targetPeriodsError) {
        console.error('Error fetching target periods:', targetPeriodsError);
        throw targetPeriodsError;
      }

      // Combine all data
      const combinedData = {
        ...companyData,
        territories: territoriesData || [],
        target_periods: targetPeriodsData || []
      };

      console.log('Company query result:', { data: combinedData });
      setCompany(combinedData);
    } catch (err: any) {
      console.error('Company fetch error:', err);
      setError(err.message);
    }
  };

  const fetchUsers = async () => {
    try {
      console.log('Fetching clients for company:', companyId);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('company_id', companyId)
        .order('name', { ascending: true });

      console.log('Clients query result:', { data, error });

      if (error) {
        console.error('Error fetching clients:', error);
        throw error;
      }
      setUsers(data || []);
    } catch (err: any) {
      console.error('Clients fetch error:', err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;

    try {
      setUserError(''); // Clear previous errors
      
      // Call the API route to delete user (server-side with admin privileges)
      const response = await fetch('/api/users/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      fetchUsers(); // Refresh the list
    } catch (err: any) {
      setUserError(err.message); // Use userError instead of error
    }
  };

  if (loading) {
    return (
      <>
        <div className="p-6">
          <p>Loading company...</p>
        </div>
      </>
    );
  }

  if (error || !company) {
    return (
      <>
        <div className="p-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Company Not Found</h1>
            <p className="text-gray-600 mb-4">{error || 'The company you are looking for does not exist.'}</p>
            <Link
              href="/admin/companies"
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Back to Companies
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6">
        <InnerPageShell
          title={company.company_name}
          breadcrumbs={[
            { label: 'Companies', href: '/admin/companies' },
            { label: company.company_name || 'Company' },
          ]}
          actions={
            <>
              <Link href={`/admin/companies/${company.id}/notes`} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition">Notes</Link>
              <Link href={`/admin/companies/${company.id}/edit`} className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">Edit Company</Link>
              <Link href="/admin/companies" className="bg-gray-300 text-gray-700 px-4 py-2 rounded hover:bg-gray-400 transition">Back</Link>
            </>
          }
        >
        <div className="space-y-6">
          {/* Top Row: Two Blocks Side by Side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Block: Company Details */}
            <Card header={<h2 className="font-semibold">Company Details</h2>}>
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-gray-500">Company Name</label>
                  <p className="text-sm">{company.company_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">NetSuite Number</label>
                  <p className="text-sm">{company.netsuite_number}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Support Fund</label>
                  <p className="text-sm">{company.support_fund?.percent || 0}%</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Subsidiary</label>
                  <p className="text-sm">{company.subsidiary?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Class</label>
                  <p className="text-sm">{company.class?.name || 'N/A'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Location</label>
                  <p className="text-sm">{company.location?.location_name || 'N/A'}</p>
                </div>
                {company.incoterm && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Incoterm</label>
                    <p className="text-sm">{company.incoterm.name}</p>
                  </div>
                )}
                {company.payment_term && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Payment Terms</label>
                    <p className="text-sm">{company.payment_term.name}</p>
                  </div>
                )}
                {company.company_tax_number && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Tax Number (VAT)</label>
                    <p className="text-sm">{company.company_tax_number}</p>
                  </div>
                )}
              </div>
            </Card>

            {/* Right Block: Contact & Shipping Information */}
            <Card header={<h2 className="font-semibold">Contact & Shipping Information</h2>}>
              <div className="space-y-4">
                {/* Company Contact Info */}
                {(company.company_address || company.company_email || company.company_phone) && (
                  <div className="border-b pb-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">Company Contact</h3>
                    {company.company_address && (
                      <div className="mb-2">
                        <label className="text-sm font-medium text-gray-500">Address</label>
                        <div className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 p-3 rounded border">
                          {company.company_address}
                        </div>
                      </div>
                    )}
                    {company.company_email && (
                      <div className="mb-2">
                        <label className="text-sm font-medium text-gray-500">Email</label>
                        <p className="text-sm">{company.company_email}</p>
                      </div>
                    )}
                    {company.company_phone && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Phone</label>
                        <p className="text-sm">{company.company_phone}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Ship To Information */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Ship To</h3>
                  {company.ship_to && (
                    <div className="mb-2">
                      <label className="text-sm font-medium text-gray-500">Address</label>
                      <div className="text-sm text-gray-700 whitespace-pre-line bg-gray-50 p-3 rounded border">
                        {company.ship_to}
                      </div>
                    </div>
                  )}
                  {company.ship_to_contact_name && (
                    <div className="mb-2">
                      <label className="text-sm font-medium text-gray-500">Contact Name</label>
                      <p className="text-sm">{company.ship_to_contact_name}</p>
                    </div>
                  )}
                  {company.ship_to_contact_email && (
                    <div className="mb-2">
                      <label className="text-sm font-medium text-gray-500">Contact Email</label>
                      <p className="text-sm">{company.ship_to_contact_email}</p>
                    </div>
                  )}
                  {company.ship_to_contact_phone && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Contact Phone</label>
                      <p className="text-sm">{company.ship_to_contact_phone}</p>
                    </div>
                  )}
                  
                  {/* Structured Address for 3PL */}
                  {(company.ship_to_street_line_1 || company.ship_to_city || company.ship_to_country) && (
                    <div className="border-t pt-3 mt-3">
                      <h4 className="text-xs font-semibold text-gray-600 mb-2">Structured Address (3PL Export)</h4>
                      {company.ship_to_street_line_1 && (
                        <div className="mb-1">
                          <label className="text-xs font-medium text-gray-500">Street 1:</label>
                          <p className="text-sm">{company.ship_to_street_line_1}</p>
                        </div>
                      )}
                      {company.ship_to_street_line_2 && (
                        <div className="mb-1">
                          <label className="text-xs font-medium text-gray-500">Street 2:</label>
                          <p className="text-sm">{company.ship_to_street_line_2}</p>
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-2">
                        {company.ship_to_city && (
                          <div>
                            <label className="text-xs font-medium text-gray-500">City:</label>
                            <p className="text-sm">{company.ship_to_city}</p>
                          </div>
                        )}
                        {company.ship_to_state && (
                          <div>
                            <label className="text-xs font-medium text-gray-500">State:</label>
                            <p className="text-sm">{company.ship_to_state}</p>
                          </div>
                        )}
                        {company.ship_to_postal_code && (
                          <div>
                            <label className="text-xs font-medium text-gray-500">Postal:</label>
                            <p className="text-sm">{company.ship_to_postal_code}</p>
                          </div>
                        )}
                      </div>
                      {company.ship_to_country && (
                        <div className="mt-1">
                          <label className="text-xs font-medium text-gray-500">Country:</label>
                          <p className="text-sm">{company.ship_to_country}</p>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!company.ship_to && !company.ship_to_contact_name && !company.ship_to_contact_email && !company.ship_to_contact_phone && (
                    <p className="text-sm text-gray-500 italic">No shipping information available</p>
                  )}
                </div>
              </div>
            </Card>
          </div>

          {/* Contract Information Section */}
          {(company.contract_execution_date || company.contract_duration_months || company.contract_status) && (
            <Card header={<h2 className="font-semibold">Contract Information</h2>}>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {company.contract_execution_date && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Contract Execution Date</label>
                    <p className="text-sm">{company.contract_execution_date}</p>
                  </div>
                )}
                {company.contract_duration_months && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Contract Duration</label>
                    <p className="text-sm">{company.contract_duration_months} months ({Math.round(company.contract_duration_months / 12)} years)</p>
                  </div>
                )}
                {company.contract_status && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Contract Status</label>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      company.contract_status === 'active' ? 'bg-green-100 text-green-800' :
                      company.contract_status === 'expired' ? 'bg-red-100 text-red-800' :
                      company.contract_status === 'suspended' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {company.contract_status.charAt(0).toUpperCase() + company.contract_status.slice(1)}
                    </span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Target Periods Section */}
          {company.target_periods && company.target_periods.length > 0 && (
            <Card header={<h2 className="font-semibold">Annual Targets & Progress</h2>}>
              <div className="space-y-4">
                {company.target_periods.map((period) => {
                  const progressPercentage = period.target_amount > 0 
                    ? Math.round((period.current_progress / period.target_amount) * 100)
                    : 0;
                  
                  return (
                    <div key={period.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-medium text-gray-900">{period.period_name}</h3>
                          <p className="text-sm text-gray-600">
                            {period.start_date} - {period.end_date}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            ${period.current_progress.toLocaleString()} / ${period.target_amount.toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">{progressPercentage}%</p>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Territories Section */}
          {company.territories && company.territories.length > 0 && (
            <Card header={<h2 className="font-semibold">Exclusive Territories</h2>}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {company.territories.map((territory) => (
                  <div
                    key={territory.id}
                    className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <span className="text-2xl">🌍</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {territory.country_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {territory.country_code}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Bottom Row: Users List (Full Width) */}
          <Card header={
            <div className="flex justify-between items-center">
              <h2 className="font-semibold">Users ({users.length})</h2>
              <Link
                href={`/admin/companies/${company.id}/users/new`}
                className="bg-black text-white px-3 py-1 rounded text-sm hover:opacity-90 transition"
              >
                Add User
              </Link>
            </div>
          }>
            {userError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                {userError}
              </div>
            )}
            
            {users.length > 0 ? (
              <div className="space-y-2">
                {users.map((user) => (
                  <div key={user.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-gray-500">{user.email}</p>
                      <span className={`text-xs px-2 py-1 rounded ${
                        user.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {user.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="flex space-x-1">
                      <Link
                        href={`/admin/companies/${company.id}/users/${user.id}/edit`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <p>No users found for this company.</p>
                <Link
                  href={`/admin/companies/${company.id}/users/new`}
                  className="mt-2 inline-block bg-black text-white px-3 py-1 rounded text-sm hover:opacity-90 transition"
                >
                  Add First User
                </Link>
              </div>
            )}
          </Card>
        </div>
        </InnerPageShell>
      </div>
    </>
  );
}
