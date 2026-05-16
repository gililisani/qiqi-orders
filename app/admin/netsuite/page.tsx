'use client';

import { useEffect, useState } from 'react';
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
    setConnectionStatus('checking');
    try {
      const { fetchWithAuth } = await import('../../../lib/fetchWithAuth');
      const response = await fetchWithAuth('/api/netsuite/test-connection');
      const data = await response.json();
      setConnectionStatus(data.connected ? 'connected' : 'disconnected');
    } catch {
      setConnectionStatus('disconnected');
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const syncProducts = async () => {};

  return (
    <div className="mt-8 mb-4 space-y-6">
        <h2 className="text-2xl font-semibold text-gray-900">NetSuite Integration</h2>
        <div className="flex items-center justify-end mb-6">
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

        {/* Inventory Sync */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-2">Inventory Sync</h2>
          <p className="text-gray-600 mb-4 text-sm">
            Pull current inventory levels from NetSuite by location and view them in the Hub.
          </p>
          <Link
            href="/admin/inventory"
            className="inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition text-sm"
          >
            Go to Inventory Sync →
          </Link>
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
  );
}
