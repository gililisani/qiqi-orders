'use client';

interface BulkUploadDefaultsProps {
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
  };
  onGlobalDefaultsChange: (defaults: BulkUploadDefaultsProps['globalDefaults']) => void;
  campaigns: Array<{ id: string; name: string }>;
  productLines: Array<{ code: string; name: string }>;
  isUploading: boolean;
}

export default function BulkUploadDefaults({
  globalDefaults,
  onGlobalDefaultsChange,
  campaigns,
  productLines,
  isUploading,
}: BulkUploadDefaultsProps) {
  const handleChange = (field: keyof typeof globalDefaults, value: any) => {
    onGlobalDefaultsChange({ ...globalDefaults, [field]: value });
  };

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-gray-500 italic">Global defaults apply only to newly added files</p>
        
        {/* Product Line */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Product Line</label>
          <select
            value={globalDefaults.productLine}
            onChange={(e) => handleChange('productLine', e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-6 min-w-[90px]"
            disabled={isUploading}
          >
            <option value="">None</option>
            {productLines.map(pl => (
              <option key={pl.code} value={pl.code}>{pl.name}</option>
            ))}
          </select>
        </div>

        {/* Campaign */}
        {campaigns.length > 0 && (
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Campaign</label>
            <select
              value={globalDefaults.campaignId || ''}
              onChange={(e) => handleChange('campaignId', e.target.value || null)}
              className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-6 min-w-[100px]"
              disabled={isUploading}
            >
              <option value="">None</option>
              {campaigns.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

