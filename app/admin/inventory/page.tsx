'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { fetchWithAuth } from '../../../lib/fetchWithAuth';

interface Location {
  id: string;
  location_name: string;
  netsuite_id: string | null;
}

interface InventoryItem {
  quantity_on_hand: number;
  quantity_available: number;
  synced_at: string;
  product: { id: number; sku: string; item_name: string } | null;
}

export default function InventorySyncPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  useEffect(() => {
    supabase
      .from('Locations')
      .select('id, location_name, netsuite_id')
      .order('location_name')
      .then(({ data }) => setLocations(data || []));
  }, []);

  const loadInventory = useCallback(async (locationId: string) => {
    if (!locationId) return;
    setLoadingInventory(true);
    try {
      const res = await fetchWithAuth(`/api/netsuite/sync-inventory?locationId=${locationId}`);
      if (res.ok) {
        const data = await res.json();
        setInventory(data.items || []);
      }
    } finally {
      setLoadingInventory(false);
    }
  }, []);

  const handleLocationChange = (id: string) => {
    setSelectedLocationId(id);
    setSyncMessage(null);
    setSyncError(null);
    setInventory([]);
    if (id) loadInventory(id);
  };

  const handleSync = async () => {
    if (!selectedLocationId) return;
    setSyncing(true);
    setSyncMessage(null);
    setSyncError(null);
    try {
      const res = await fetchWithAuth('/api/netsuite/sync-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId: selectedLocationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      setSyncMessage(data.message);
      await loadInventory(selectedLocationId);
    } catch (err: any) {
      setSyncError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  const selectedLocation = locations.find(l => l.id === selectedLocationId);
  const lastSync = inventory[0]?.synced_at
    ? new Date(inventory[0].synced_at).toLocaleString()
    : null;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-2xl font-bold mb-6">Inventory Sync</h1>
      <p className="text-gray-500 text-sm mb-6">
        Pull current inventory levels from NetSuite for a specific location into the Hub.
      </p>

      <div className="flex items-end gap-4 mb-6">
        <div className="flex-1 max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-2">Location</label>
          <select
            value={selectedLocationId}
            onChange={e => handleLocationChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
          >
            <option value="">Select a location...</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id} disabled={!loc.netsuite_id}>
                {loc.location_name}{!loc.netsuite_id ? ' (no NetSuite ID)' : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSync}
          disabled={!selectedLocationId || !selectedLocation?.netsuite_id || syncing}
          className="bg-black text-white px-5 py-2 rounded hover:opacity-90 transition disabled:opacity-40 text-sm"
        >
          {syncing ? 'Syncing from NetSuite...' : 'Sync Now'}
        </button>
      </div>

      {syncMessage && (
        <div className="bg-green-50 border border-green-300 text-green-800 px-4 py-3 rounded mb-4 text-sm">
          {syncMessage}
        </div>
      )}
      {syncError && (
        <div className="bg-red-50 border border-red-300 text-red-800 px-4 py-3 rounded mb-4 text-sm">
          {syncError}
        </div>
      )}

      {selectedLocationId && (
        <div>
          {lastSync && (
            <p className="text-xs text-gray-400 mb-3">Last synced: {lastSync}</p>
          )}

          {loadingInventory ? (
            <p className="text-sm text-gray-500">Loading inventory...</p>
          ) : inventory.length === 0 ? (
            <p className="text-sm text-gray-500">
              No inventory data for this location yet. Click Sync Now to pull from NetSuite.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm border border-gray-200 rounded">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">SKU</th>
                    <th className="px-4 py-2 text-left font-medium text-gray-600">Product</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">On Hand</th>
                    <th className="px-4 py-2 text-right font-medium text-gray-600">Available</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inventory.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{item.product?.sku ?? '—'}</td>
                      <td className="px-4 py-2">{item.product?.item_name ?? '—'}</td>
                      <td className="px-4 py-2 text-right">{item.quantity_on_hand}</td>
                      <td className="px-4 py-2 text-right">{item.quantity_available}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">{inventory.length} items</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
