'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import Card from '../../components/ui/Card';
import ContractInfo from '../../components/shared/ContractInfo';
import TerritoryList from '../../components/shared/TerritoryList';
import { formatCurrency } from '../../../lib/formatters';

interface Company {
  id: string;
  company_name: string;
  netsuite_number: string;
  support_fund_id?: string;
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
  contract_execution_date?: string;
  contract_duration_months?: number;
  contract_status?: string;
  support_fund?: { percent: number };
  incoterm?: { name: string };
  payment_term?: { name: string };
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

interface Stats {
  ordersThisYear: number;
  openOrders: number;
  totalValueThisYear: number;
}

export default function YourCompanyPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [targetPeriods, setTargetPeriods] = useState<TargetPeriod[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [stats, setStats] = useState<Stats>({
    ordersThisYear: 0,
    openOrders: 0,
    totalValueThisYear: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not found');

      // Get user's company info
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (clientError) throw clientError;
      if (!clientData?.company_id) throw new Error('User not associated with a company');

      // Fetch all data in parallel
      await Promise.all([
        fetchCompany(clientData.company_id),
        fetchTerritories(clientData.company_id),
        fetchTargetPeriods(clientData.company_id),
        fetchUsers(clientData.company_id),
        fetchStats(clientData.company_id),
      ]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchCompany = async (companyId: string) => {
    const { data, error } = await supabase
      .from('companies')
      .select(`
        *,
        support_fund:support_fund_levels(percent),
        incoterm:incoterms(name),
        payment_term:payment_terms(name)
      `)
      .eq('id', companyId)
      .single();

    if (error) throw error;
    setCompany(data);
  };

  const fetchTerritories = async (companyId: string) => {
    const { data, error } = await supabase
      .from('company_territories')
      .select('*')
      .eq('company_id', companyId);

    if (error) throw error;
    setTerritories(data || []);
  };

  const fetchTargetPeriods = async (companyId: string) => {
    const { data, error } = await supabase
      .from('target_periods')
      .select('*')
      .eq('company_id', companyId)
      .order('start_date', { ascending: true });

    if (error) throw error;

    // Calculate current_progress dynamically for each target period
    const { calculateTargetPeriodProgress } = await import('../../../lib/targetPeriods');
    const targetPeriodsWithProgress = await Promise.all(
      (data || []).map(async (period) => {
        const progress = await calculateTargetPeriodProgress(
          supabase,
          companyId,
          period.start_date,
          period.end_date
        );
        return {
          ...period,
          current_progress: progress
        };
      })
    );

    setTargetPeriods(targetPeriodsWithProgress);
  };

  const fetchUsers = async (companyId: string) => {
    const { data, error } = await supabase
      .from('clients')
      .select('id, name, email, enabled, created_at')
      .eq('company_id', companyId)
      .order('name', { ascending: true });

    if (error) throw error;
    setUsers(data || []);
  };

  const fetchStats = async (companyId: string) => {
    const currentYear = new Date().getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const yearEnd = `${currentYear}-12-31`;

    // Get all orders for the company
    const { data: allOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, created_at, status, total_value')
      .eq('company_id', companyId);

    if (ordersError) throw ordersError;

    // Calculate stats
    const ordersThisYear = (allOrders || []).filter(order => {
      const orderDate = new Date(order.created_at);
      return orderDate >= new Date(yearStart) && orderDate <= new Date(yearEnd);
    });

    const openOrders = (allOrders || []).filter(order => 
      !['Done', 'Cancelled', 'Draft'].includes(order.status)
    );

    const totalValueThisYear = ordersThisYear.reduce((sum, order) => sum + (order.total_value || 0), 0);

    setStats({
      ordersThisYear: ordersThisYear.length,
      openOrders: openOrders.length,
      totalValueThisYear,
    });
  };

  const formatShipToAddress = () => {
    if (!company) return 'N/A';
    const parts = [
      company.ship_to_street_line_1,
      company.ship_to_street_line_2,
      company.ship_to_city,
      company.ship_to_state,
      company.ship_to_postal_code,
      company.ship_to_country,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'N/A';
  };

  const calculateExpirationDate = () => {
    if (!company?.contract_execution_date || !company?.contract_duration_months) return null;
    const executionDate = new Date(company.contract_execution_date);
    executionDate.setMonth(executionDate.getMonth() + company.contract_duration_months);
    return executionDate;
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
        <p className="text-gray-600">Loading company information...</p>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="text-center py-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Error</h1>
        <p className="text-gray-600 mb-4">{error || 'Company information not found.'}</p>
      </div>
    );
  }

  const supportFundPercent = Array.isArray(company.support_fund)
    ? (company.support_fund[0]?.percent || 0)
    : (company.support_fund?.percent || 0);

  const expirationDate = calculateExpirationDate();

  return (
    <div className="mt-8 mb-4 space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">Your Company</h2>

      {/* Stats Boxes */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <div className="p-6">
            <div className="text-sm font-medium text-gray-500 mb-1">Orders This Year</div>
            <div className="text-3xl font-bold text-gray-900">{stats.ordersThisYear}</div>
            <div className="text-xs text-gray-500 mt-1">Calendar year {new Date().getFullYear()}</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="text-sm font-medium text-gray-500 mb-1">Open Orders</div>
            <div className="text-3xl font-bold text-gray-900">{stats.openOrders}</div>
            <div className="text-xs text-gray-500 mt-1">Orders in progress</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="text-sm font-medium text-gray-500 mb-1">Total Orders Value</div>
            <div className="text-3xl font-bold text-gray-900">{formatCurrency(stats.totalValueThisYear)}</div>
            <div className="text-xs text-gray-500 mt-1">This year</div>
          </div>
        </Card>
      </div>

      {/* Company Details */}
      <Card header={<h3 className="text-lg font-semibold">Company Details</h3>}>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Details */}
            <div className="space-y-6">
              <h4 className="text-base font-semibold text-gray-900 border-b border-gray-200 pb-2">Details</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Company Name</label>
                  <p className="text-sm text-gray-900">{company.company_name}</p>
                </div>

                {company.company_email && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Company Email</label>
                    <p className="text-sm text-gray-900">{company.company_email}</p>
                  </div>
                )}

                {company.company_phone && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Company Phone</label>
                    <p className="text-sm text-gray-900">{company.company_phone}</p>
                  </div>
                )}

                {company.company_address && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Company Address</label>
                    <p className="text-sm text-gray-900 whitespace-pre-line">{company.company_address}</p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Ship To Address</label>
                  <p className="text-sm text-gray-900">{formatShipToAddress()}</p>
                </div>

                {company.company_tax_number && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Tax Information</label>
                    <p className="text-sm text-gray-900">{company.company_tax_number}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Financials */}
            <div className="space-y-6">
              <h4 className="text-base font-semibold text-gray-900 border-b border-gray-200 pb-2">Financials</h4>
              <div className="space-y-4">
                {company.incoterm && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Incoterm</label>
                    <p className="text-sm text-gray-900">{company.incoterm.name}</p>
                  </div>
                )}

                {company.payment_term && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Payment Terms</label>
                    <p className="text-sm text-gray-900">{company.payment_term.name}</p>
                  </div>
                )}

                {supportFundPercent > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Support Funds</label>
                    <p className="text-sm text-gray-900">
                      <span className="text-green-600 font-medium">{supportFundPercent}%</span>
                    </p>
                  </div>
                )}

                {company.company_tax_number && (
                  <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Tax</label>
                    <p className="text-sm text-gray-900">{company.company_tax_number}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Contract Information */}
      <Card header={<h3 className="text-lg font-semibold">Contract Information</h3>}>
        <div className="p-6">
          {company.contract_execution_date || company.contract_duration_months || targetPeriods.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {company.contract_execution_date && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Execution Date</label>
                  <p className="text-sm text-gray-900">
                    {new Date(company.contract_execution_date).toLocaleDateString()}
                  </p>
                </div>
              )}

              {company.contract_duration_months && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Duration</label>
                  <p className="text-sm text-gray-900">{company.contract_duration_months} months</p>
                </div>
              )}

              {expirationDate && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">Expiration Date</label>
                  <p className="text-sm text-gray-900">{expirationDate.toLocaleDateString()}</p>
                </div>
              )}

              {targetPeriods.length > 0 && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-500 mb-3">Annual Targets</label>
                  <div className="space-y-3">
                    {targetPeriods.map((period) => (
                      <div key={period.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="text-sm font-medium text-gray-900">{period.period_name}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(period.start_date).toLocaleDateString()} - {new Date(period.end_date).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(period.target_amount)}
                            </p>
                            <p className="text-xs text-gray-500">
                              Progress: {formatCurrency(period.current_progress || 0)}
                            </p>
                          </div>
                        </div>
                        {period.target_amount > 0 && (
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{
                                width: `${Math.min(100, ((period.current_progress || 0) / period.target_amount) * 100)}%`,
                              }}
                            ></div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No contract information available.</p>
          )}
        </div>
      </Card>

      {/* Territories */}
      <Card header={<h3 className="text-lg font-semibold">Territories</h3>}>
        <div className="p-6">
          {territories.length > 0 ? (
            <TerritoryList
              companyId={company.id}
              userRole="client"
              showActions={false}
              allowEdit={false}
            />
          ) : (
            <p className="text-sm text-gray-500">No territories assigned.</p>
          )}
        </div>
      </Card>

      {/* Users */}
      <Card header={<h3 className="text-lg font-semibold">Users</h3>}>
        <div className="p-6">
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full border border-[#e5e5e5] rounded-lg">
                <thead>
                  <tr className="border-b border-[#e5e5e5] bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">
                      Created
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className="border-b border-[#e5e5e5] hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{user.email}</td>
                      <td className="px-4 py-3 text-sm">
                        {user.enabled ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            Disabled
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No users found.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
