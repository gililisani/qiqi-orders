'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import ClientLayout from '../../components/ClientLayout';

export default function TestDBPage() {
  const [results, setResults] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const testDatabase = async () => {
    setLoading(true);
    const testResults: any = {};

    try {
      // Test 1: Check if we can access products without class filtering
      console.log('Testing basic products query...');
      const { data: basicProducts, error: basicError } = await supabase
        .from('Products')
        .select('id, item_name, enable')
        .eq('enable', true)
        .limit(5);
      
      testResults.basicProducts = {
        data: basicProducts,
        error: basicError,
        count: basicProducts?.length || 0
      };

      // Test 2: Check if visibility columns exist
      console.log('Testing visibility columns...');
      const { data: visibilityTest, error: visibilityError } = await supabase
        .from('Products')
        .select('id, item_name, visible_to_americas, visible_to_international')
        .limit(1);
      
      testResults.visibilityColumns = {
        data: visibilityTest,
        error: visibilityError,
        hasColumns: !visibilityError
      };

      // Test 3: Check client data
      console.log('Testing client data...');
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: clientData, error: clientError } = await supabase
          .from('clients')
          .select(`
            id,
            company_id,
            company:companies(
              id,
              company_name,
              class:classes(name)
            )
          `)
          .eq('id', user.id)
          .single();
        
        testResults.clientData = {
          user: user.id,
          data: clientData,
          error: clientError
        };
      }

      // Test 4: Check if we can query with class filtering (if columns exist)
      if (!visibilityError) {
        console.log('Testing class filtering...');
        const { data: americasProducts, error: americasError } = await supabase
          .from('Products')
          .select('id, item_name')
          .eq('enable', true)
          .eq('visible_to_americas', true)
          .limit(3);
        
        testResults.classFiltering = {
          americas: { data: americasProducts, error: americasError }
        };
      }

    } catch (error) {
      console.error('Error during database tests:', error);
      testResults.error = error;
    }

    setResults(testResults);
    setLoading(false);
  };

  return (
    <ClientLayout>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Database Test</h1>
        
        <button
          onClick={testDatabase}
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
                  {value.count !== undefined && (
                    <p><strong>Count:</strong> {value.count}</p>
                  )}
                  {value.hasColumns !== undefined && (
                    <p><strong>Has Visibility Columns:</strong> {value.hasColumns ? 'Yes' : 'No'}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded">
          <h3 className="font-semibold mb-2">If visibility columns are missing, run this SQL:</h3>
          <pre className="text-xs bg-white p-2 rounded overflow-auto">
{`ALTER TABLE "Products" 
ADD COLUMN "visible_to_americas" BOOLEAN DEFAULT true,
ADD COLUMN "visible_to_international" BOOLEAN DEFAULT true;

UPDATE "Products" 
SET 
  "visible_to_americas" = true,
  "visible_to_international" = true
WHERE "visible_to_americas" IS NULL OR "visible_to_international" IS NULL;`}
          </pre>
        </div>
      </div>
    </ClientLayout>
  );
}
