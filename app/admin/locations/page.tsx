'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import AdminLayout from '../../components/AdminLayout';
import Link from 'next/link';

interface Location {
  id: string;
  location_name: string;
  country?: string;
  created_at: string;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLocations();
  }, []);

  const fetchLocations = async () => {
    try {
      const { data, error } = await supabase
        .from('Locations')
        .select('*')
        .order('location_name', { ascending: true });

      if (error) {
        console.error('Error fetching locations:', error);
        setError('Failed to load locations.');
      } else {
        setLocations(data || []);
      }
    } catch (err) {
      console.error('Unexpected error fetching locations:', err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this location?')) return;

    try {
      const { error } = await supabase
        .from('Locations')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting location:', error);
        setError('Failed to delete location.');
      } else {
        setLocations(locations.filter(location => location.id !== id));
      }
    } catch (err) {
      console.error('Unexpected error deleting location:', err);
      setError('An unexpected error occurred.');
    }
  };

  const filteredLocations = locations.filter(location =>
    location.location_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    location.country?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="p-6">
          <p>Loading locations...</p>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Locations Management</h1>
          <Link
            href="/admin/locations/new"
            className="bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
          >
            Add New Location
          </Link>
        </div>

        <div className="mb-6">
          <input
            type="text"
            placeholder="Search locations by name or country..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded shadow-sm focus:outline-none"
          />
        </div>

        {error && <p className="text-red-600 mb-4">{error}</p>}

        {filteredLocations.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {filteredLocations.map((location) => (
                <li key={location.id} className="px-6 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-medium text-gray-900">
                        {location.location_name}
                      </h3>
                      {location.country && (
                        <p className="text-sm text-gray-500">
                          Country: {location.country}
                        </p>
                      )}
                    </div>
                    <div className="flex space-x-2">
                      <Link
                        href={`/admin/locations/${location.id}/edit`}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={() => handleDelete(location.id)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center p-10 border rounded-lg bg-gray-50">
            <p className="text-lg text-gray-700 mb-4">No locations found. Start by adding a new location!</p>
            <Link
              href="/admin/locations/new"
              className="mt-4 inline-block bg-black text-white px-4 py-2 rounded hover:opacity-90 transition"
            >
              Add Your First Location
            </Link>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
