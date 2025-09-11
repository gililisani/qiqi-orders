'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';

export default function DebugPage() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const testQueries = async () => {
    setLoading(true);
    const testResults: any = {};

    try {
      // Test 1: Check if we can access support_fund_levels
      console.log('Testing support_fund_levels table...');
      const { data: supportFunds, error: supportFundsError } = await supabase
        .from('support_fund_levels')
        .select('*');
      
      testResults.support_fund_levels = {
        data: supportFunds,
        error: supportFundsError,
        count: supportFunds?.length || 0
      };

      // Test 2: Check if we can access with different table name
      console.log('Testing support_fund_levels with quotes...');
      const { data: supportFundsQuoted, error: supportFundsQuotedError } = await supabase
        .from('"support_fund_levels"')
        .select('*');
      
      testResults.support_fund_levels_quoted = {
        data: supportFundsQuoted,
        error: supportFundsQuotedError,
        count: supportFundsQuoted?.length || 0
      };

      // Test 3: Check if we can access other tables
      console.log('Testing subsidiaries table...');
      const { data: subsidiaries, error: subsidiariesError } = await supabase
        .from('subsidiaries')
        .select('*');
      
      testResults.subsidiaries = {
        data: subsidiaries,
        error: subsidiariesError,
        count: subsidiaries?.length || 0
      };

      // Test 4: Check current user
      console.log('Checking current user...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      testResults.current_user = {
        user: user,
        error: userError
      };

      // Test 5: Check user profile
      if (user) {
        console.log('Checking user profile...');
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single();
        
        testResults.user_profile = {
          data: profile,
          error: profileError
        };
      }

    } catch (err) {
      console.error('Test error:', err);
      testResults.general_error = err;
    }

    setResults(testResults);
    setLoading(false);
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Database Debug Page</h1>
        
        <button
          onClick={testQueries}
          disabled={loading}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition disabled:opacity-50 mb-6"
        >
          {loading ? 'Testing...' : 'Run Database Tests'}
        </button>

        {Object.keys(results).length > 0 && (
          <div className="space-y-6">
            {Object.entries(results).map(([key, value]) => (
              <div key={key} className="bg-gray-100 p-4 rounded">
                <h3 className="font-bold text-lg mb-2">{key}</h3>
                <pre className="bg-white p-3 rounded text-sm overflow-auto">
                  {JSON.stringify(value, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
