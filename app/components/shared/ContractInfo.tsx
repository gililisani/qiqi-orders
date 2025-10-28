'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { CalendarIcon, ChartBarIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ContractInfo {
  id: string;
  company_name: string;
  contract_execution_date: string | null;
  contract_duration_months: number | null;
  annual_target_amount: number | null;
  current_annual_progress: number | null;
  contract_status: 'active' | 'expired' | 'suspended' | 'terminated';
}

interface ContractInfoProps {
  companyId: string;
  userRole: 'admin' | 'client';
  showActions?: boolean;
  allowEdit?: boolean;
  className?: string;
}

export default function ContractInfo({
  companyId,
  userRole,
  showActions = userRole === 'admin',
  allowEdit = userRole === 'admin',
  className = ''
}: ContractInfoProps) {
  const [loading, setLoading] = useState(true);
  const [contract, setContract] = useState<ContractInfo | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (companyId) {
      fetchContractInfo();
    }
  }, [companyId]);

  const fetchContractInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select(`
          id,
          company_name,
          contract_execution_date,
          contract_duration_months,
          annual_target_amount,
          current_annual_progress,
          contract_status
        `)
        .eq('id', companyId)
        .single();

      if (error) throw error;
      setContract(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getContractStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'suspended':
        return 'bg-yellow-100 text-yellow-800';
      case 'terminated':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getContractStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircleIcon className="h-5 w-5 text-green-600" />;
      case 'expired':
      case 'suspended':
      case 'terminated':
        return <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />;
      default:
        return <ExclamationTriangleIcon className="h-5 w-5 text-gray-600" />;
    }
  };

  const calculateProgressPercentage = () => {
    if (!contract?.annual_target_amount || !contract?.current_annual_progress) return 0;
    return Math.round((contract.current_annual_progress / contract.annual_target_amount) * 100);
  };

  const calculateContractExpiry = () => {
    if (!contract?.contract_execution_date || !contract?.contract_duration_months) return null;
    const executionDate = new Date(contract.contract_execution_date);
    const expiryDate = new Date(executionDate);
    expiryDate.setMonth(expiryDate.getMonth() + contract.contract_duration_months);
    return expiryDate;
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
        <p className="text-gray-600">Loading contract information...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-red-600 mb-4">
          <ExclamationTriangleIcon className="h-12 w-12 mx-auto mb-2" />
          <h3 className="text-lg font-medium">Error Loading Contract</h3>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-gray-400 mb-4">
          <ChartBarIcon className="h-12 w-12 mx-auto mb-2" />
          <h3 className="text-lg font-medium">No Contract Information</h3>
          <p className="text-sm text-gray-600">
            {userRole === 'admin' 
              ? 'Contract information has not been set up for this company.'
              : 'Contract information is not available.'
            }
          </p>
        </div>
      </div>
    );
  }

  const progressPercentage = calculateProgressPercentage();
  const contractExpiry = calculateContractExpiry();

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Contract Information</h2>
        {showActions && allowEdit && (
          <button className="text-blue-600 hover:text-blue-800 text-sm">
            Edit Contract
          </button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {/* Contract Status */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            {getContractStatusIcon(contract.contract_status)}
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Contract Status</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getContractStatusColor(contract.contract_status)}`}>
                {contract.contract_status.charAt(0).toUpperCase() + contract.contract_status.slice(1)}
              </span>
            </div>
          </div>
        </div>

        {/* Contract Details Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Execution Date */}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Contract Execution Date</label>
            <div className="flex items-center space-x-2">
              <CalendarIcon className="h-4 w-4 text-gray-400" />
              <span className="text-sm text-gray-900">
                {contract.contract_execution_date 
                  ? new Date(contract.contract_execution_date).toLocaleDateString()
                  : 'Not set'
                }
              </span>
            </div>
          </div>

          {/* Contract Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Contract Duration</label>
            <span className="text-sm text-gray-900">
              {contract.contract_duration_months 
                ? `${contract.contract_duration_months} months (${Math.round(contract.contract_duration_months / 12)} years)`
                : 'Not set'
              }
            </span>
          </div>

          {/* Contract Expiry */}
          {contractExpiry && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Contract Expiry</label>
              <div className="flex items-center space-x-2">
                <CalendarIcon className="h-4 w-4 text-gray-400" />
                <span className="text-sm text-gray-900">
                  {contractExpiry.toLocaleDateString()}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Annual Targets and Progress */}
        {contract.annual_target_amount && (
          <div className="border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Annual Targets & Progress</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
              {/* Annual Target */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Annual Target</label>
                <span className="text-lg font-semibold text-gray-900">
                  {formatCurrency(contract.annual_target_amount)}
                </span>
              </div>

              {/* Current Progress */}
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">Current Progress</label>
                <span className="text-lg font-semibold text-gray-900">
                  {formatCurrency(contract.current_annual_progress)}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-2">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Progress</span>
                <span>{progressPercentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(progressPercentage, 100)}%` }}
                ></div>
              </div>
            </div>

            {/* Progress Status */}
            <div className="text-sm text-gray-600">
              {progressPercentage >= 100 ? (
                <span className="text-green-600 font-medium">🎉 Target achieved!</span>
              ) : progressPercentage >= 75 ? (
                <span className="text-blue-600 font-medium">📈 On track to meet target</span>
              ) : progressPercentage >= 50 ? (
                <span className="text-yellow-600 font-medium">⚠️ Progress needed</span>
              ) : (
                <span className="text-red-600 font-medium">🚨 Behind target</span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
