'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';

export default function DebugDBPage() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const testDatabaseAccess = async () => {
    setLoading(true);
    const testResults: any = {};

    try {
      // Test 1: Check if we can access locations
      console.log('Testing Locations table...');
      const { data: locations, error: locationsError } = await supabase
        .from('Locations')
        .select('*');
      
      testResults.locations = {
        data: locations,
        error: locationsError,
        count: locations?.length || 0
      };

      // Test 2: Check if we can access support_fund_levels
      console.log('Testing support_fund_levels table...');
      const { data: supportFunds, error: supportFundsError } = await supabase
        .from('support_fund_levels')
        .select('*');
      
      testResults.support_fund_levels = {
        data: supportFunds,
        error: supportFundsError,
        count: supportFunds?.length || 0
      };

      // Test 3: Check if we can access subsidiaries
      console.log('Testing subsidiaries table...');
      const { data: subsidiaries, error: subsidiariesError } = await supabase
        .from('subsidiaries')
        .select('*');
      
      testResults.subsidiaries = {
        data: subsidiaries,
        error: subsidiariesError,
        count: subsidiaries?.length || 0
      };

      // Test 4: Check if we can access classes
      console.log('Testing classes table...');
      const { data: classes, error: classesError } = await supabase
        .from('classes')
        .select('*');
      
      testResults.classes = {
        data: classes,
        error: classesError,
        count: classes?.length || 0
      };

      // Test 5: Check if we can access products
      console.log('Testing Products table...');
      const { data: products, error: productsError } = await supabase
        .from('Products')
        .select('*');
      
      testResults.products = {
        data: products,
        error: productsError,
        count: products?.length || 0
      };

      // Test 6: Check current user
      const { data: { user } } = await supabase.auth.getUser();
      testResults.currentUser = {
        user: user,
        userId: user?.id
      };

    } catch (error) {
      console.error('Error during database tests:', error);
      testResults.error = error;
    }

    setResults(testResults);
    setLoading(false);
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Database Debug</h1>
        
        <button
          onClick={testDatabaseAccess}
          disabled={loading}
          className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50 mb-6"
        >
          {loading ? 'Testing...' : 'Test Database Access'}
        </button>

        {Object.keys(results).length > 0 && (
          <div className="space-y-4">
            {Object.entries(results).map(([key, value]: [string, any]) => (
              <div key={key} className="bg-white p-4 rounded-lg shadow">
                <h3 className="font-semibold text-lg mb-2">{key}</h3>
                <div className="text-sm">
                  <p><strong>Count:</strong> {value.count || 'N/A'}</p>
                  {value.error && (
                    <p className="text-red-600"><strong>Error:</strong> {JSON.stringify(value.error)}</p>
                  )}
                  {value.data && (
                    <div>
                      <p><strong>Data:</strong></p>
                      <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-40">
                        {JSON.stringify(value.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
