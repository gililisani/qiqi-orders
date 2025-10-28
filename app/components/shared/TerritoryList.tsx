'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { MapIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

interface Territory {
  id: string;
  country_code: string;
  country_name: string;
  created_at: string;
}

interface TerritoryListProps {
  companyId: string;
  userRole: 'admin' | 'client';
  showActions?: boolean;
  allowEdit?: boolean;
  className?: string;
}

export default function TerritoryList({
  companyId,
  userRole,
  showActions = userRole === 'admin',
  allowEdit = userRole === 'admin',
  className = ''
}: TerritoryListProps) {
  const [loading, setLoading] = useState(true);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (companyId) {
      fetchTerritories();
    }
  }, [companyId]);

  const fetchTerritories = async () => {
    try {
      const { data, error } = await supabase
        .from('company_territories')
        .select('*')
        .eq('company_id', companyId)
        .order('country_name', { ascending: true });

      if (error) throw error;
      setTerritories(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getCountryFlag = (countryCode: string) => {
    // Simple flag emoji mapping for common countries
    const flags: { [key: string]: string } = {
      'US': '🇺🇸',
      'CA': '🇨🇦',
      'MX': '🇲🇽',
      'GB': '🇬🇧',
      'DE': '🇩🇪',
      'FR': '🇫🇷',
      'IT': '🇮🇹',
      'ES': '🇪🇸',
      'AU': '🇦🇺',
      'JP': '🇯🇵',
      'CN': '🇨🇳',
      'IN': '🇮🇳',
      'BR': '🇧🇷',
      'AR': '🇦🇷',
      'CL': '🇨🇱',
      'CO': '🇨🇴',
      'PE': '🇵🇪',
      'ZA': '🇿🇦',
      'NG': '🇳🇬',
      'EG': '🇪🇬',
      'AE': '🇦🇪',
      'SA': '🇸🇦',
      'TR': '🇹🇷',
      'RU': '🇷🇺',
      'KR': '🇰🇷',
      'SG': '🇸🇬',
      'MY': '🇲🇾',
      'TH': '🇹🇭',
      'ID': '🇮🇩',
      'PH': '🇵🇭',
      'VN': '🇻🇳'
    };
    return flags[countryCode] || '🌍';
  };

  if (loading) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
        <p className="text-gray-600">Loading territories...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-red-600 mb-4">
          <MapIcon className="h-12 w-12 mx-auto mb-2" />
          <h3 className="text-lg font-medium">Error Loading Territories</h3>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Exclusive Territories</h2>
        {showActions && allowEdit && (
          <button className="text-blue-600 hover:text-blue-800 text-sm">
            Manage Territories
          </button>
        )}
      </div>

      {territories.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <GlobeAltIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Territories Assigned</h3>
          <p className="text-gray-600 mb-6">
            {userRole === 'admin' 
              ? 'This company does not have any exclusive territories assigned yet.'
              : 'No exclusive territories have been assigned to your company.'
            }
          </p>
          {allowEdit && (
            <button className="bg-black text-white px-6 py-3 rounded hover:opacity-90 transition">
              Assign Territories
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          {/* Territory Count */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-2">
              <MapIcon className="h-5 w-5 text-gray-500" />
              <span className="text-sm text-gray-600">
                {territories.length} {territories.length === 1 ? 'territory' : 'territories'} assigned
              </span>
            </div>
            {userRole === 'client' && (
              <span className="text-xs text-gray-500">
                Exclusive distribution rights
              </span>
            )}
          </div>

          {/* Territories Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {territories.map((territory) => (
              <div
                key={territory.id}
                className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <span className="text-2xl">{getCountryFlag(territory.country_code)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {territory.country_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {territory.country_code}
                  </p>
                </div>
                {showActions && allowEdit && (
                  <button className="text-red-600 hover:text-red-800 text-sm">
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Future Map Integration Note */}
          {userRole === 'admin' && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm text-blue-800">
                <strong>Future Enhancement:</strong> Territory visualization on world map coming soon.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
