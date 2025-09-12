'use client';

import { useEffect, useState } from 'react';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

export default function NetSuitePage() {
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncInProgress, setSyncInProgress] = useState(false);
  const [syncResults, setSyncResults] = useState<any>(null);

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const response = await fetch('/api/netsuite/products/sync');
      const data = await response.json();
      setConnectionStatus(data.connected ? 'connected' : 'disconnected');
    } catch (error) {
      setConnectionStatus('disconnected');
    }
  };

  const syncProducts = async () => {
    setSyncInProgress(true);
    setSyncResults(null);
    
    try {
      const response = await fetch('/api/netsuite/products/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const data = await response.json();
      setSyncResults(data);
      setLastSync(new Date().toLocaleString());
      
      if (data.success) {
        // Refresh the page to show updated products
        window.location.reload();
      }
    } catch (error) {
      setSyncResults({ error: 'Failed to sync products' });
    } finally {
      setSyncInProgress(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">NetSuite Integration</h1>
          <Link
            href="/admin"
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Admin Dashboard
          </Link>
        </div>

        {/* Connection Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Connection Status</h2>
          <div className="flex items-center space-x-3">
            <div className={`w-3 h-3 rounded-full ${
              connectionStatus === 'connected' ? 'bg-green-500' : 
              connectionStatus === 'disconnected' ? 'bg-red-500' : 
              'bg-yellow-500'
            }`}></div>
            <span className="text-sm font-medium">
              {connectionStatus === 'connected' ? 'Connected to NetSuite' :
               connectionStatus === 'disconnected' ? 'Disconnected from NetSuite' :
               'Checking connection...'}
            </span>
            <button
              onClick={checkConnection}
              className="ml-4 text-sm text-blue-600 hover:text-blue-800"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Product Sync */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Product Synchronization</h2>
          <p className="text-gray-600 mb-4">
            Sync products from NetSuite to your local database. This will update existing products and add new ones.
          </p>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={syncProducts}
              disabled={syncInProgress || connectionStatus === 'disconnected'}
              className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition disabled:opacity-50"
            >
              {syncInProgress ? 'Syncing...' : 'Sync Products from NetSuite'}
            </button>
            
            {lastSync && (
              <span className="text-sm text-gray-500">
                Last sync: {lastSync}
              </span>
            )}
          </div>

          {syncResults && (
            <div className={`mt-4 p-4 rounded ${
              syncResults.success ? 'bg-green-100 border border-green-400 text-green-700' :
              'bg-red-100 border border-red-400 text-red-700'
            }`}>
              <h3 className="font-semibold mb-2">
                {syncResults.success ? 'Sync Completed' : 'Sync Failed'}
              </h3>
              <p className="text-sm">{syncResults.message}</p>
              {syncResults.results && (
                <div className="mt-2 text-sm">
                  <p>Created: {syncResults.results.created}</p>
                  <p>Updated: {syncResults.results.updated}</p>
                  <p>Errors: {syncResults.results.errors}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Configuration Help */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Configuration</h2>
          <p className="text-gray-600 mb-4">
            To use NetSuite integration, you need to configure the following environment variables:
          </p>
          
          <div className="bg-gray-100 p-4 rounded text-sm font-mono">
            <div>NETSUITE_ACCOUNT_ID=your_account_id</div>
            <div>NETSUITE_CONSUMER_KEY=your_consumer_key</div>
            <div>NETSUITE_CONSUMER_SECRET=your_consumer_secret</div>
            <div>NETSUITE_TOKEN_ID=your_token_id</div>
            <div>NETSUITE_TOKEN_SECRET=your_token_secret</div>
            <div>NETSUITE_REALM=your_realm</div>
          </div>
          
          <div className="mt-4 text-sm text-gray-600">
            <p className="font-semibold">Setup Steps:</p>
            <ol className="list-decimal list-inside mt-2 space-y-1">
              <li>Create an Integration in NetSuite (Setup → Integrations → New Integration)</li>
              <li>Generate OAuth 1.0 credentials</li>
              <li>Add the credentials to your environment variables</li>
              <li>Test the connection using the button above</li>
            </ol>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
