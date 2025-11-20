'use client';

import { LocaleOption, RegionOption } from './types';

interface BulkUploadDefaultsProps {
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedRegionCodes: string[];
    selectedTagSlugs: string[];
  };
  onGlobalDefaultsChange: (defaults: BulkUploadDefaultsProps['globalDefaults']) => void;
  locales: LocaleOption[];
  regions: RegionOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  campaigns: Array<{ id: string; name: string }>;
  isUploading: boolean;
}

export default function BulkUploadDefaults({
  globalDefaults,
  onGlobalDefaultsChange,
  locales,
  regions,
  tags,
  campaigns,
  isUploading,
}: BulkUploadDefaultsProps) {
  const handleChange = (field: keyof typeof globalDefaults, value: any) => {
    onGlobalDefaultsChange({ ...globalDefaults, [field]: value });
  };

  const handleMultiSelectChange = (field: 'selectedLocaleCodes' | 'selectedRegionCodes' | 'selectedTagSlugs', e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
    if (field === 'selectedLocaleCodes') {
      handleChange('selectedLocaleCodes', selected);
      if (selected.length > 0 && !selected.includes(globalDefaults.primaryLocale || '')) {
        handleChange('primaryLocale', selected[0]);
      }
    } else {
      handleChange(field, selected);
    }
  };

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-1.5">
      <div className="flex items-center gap-3 flex-wrap">
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
            <option value="ProCtrl">ProCtrl</option>
            <option value="SelfCtrl">SelfCtrl</option>
            <option value="Both">Both</option>
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

        {/* Locales */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Locales *</label>
          <select
            multiple
            value={globalDefaults.selectedLocaleCodes}
            onChange={(e) => handleMultiSelectChange('selectedLocaleCodes', e)}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-6 min-w-[120px]"
            disabled={isUploading}
            size={1}
          >
            {locales.map(loc => (
              <option key={loc.code} value={loc.code}>{loc.label}</option>
            ))}
          </select>
          {globalDefaults.selectedLocaleCodes.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {globalDefaults.selectedLocaleCodes.map(code => {
                const locale = locales.find(l => l.code === code);
                return locale ? (
                  <span key={code} className="inline-flex items-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                    {locale.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Regions */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Regions</label>
          <select
            multiple
            value={globalDefaults.selectedRegionCodes}
            onChange={(e) => handleMultiSelectChange('selectedRegionCodes', e)}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-6 min-w-[120px]"
            disabled={isUploading}
            size={1}
          >
            {regions.map(reg => (
              <option key={reg.code} value={reg.code}>{reg.label}</option>
            ))}
          </select>
          {globalDefaults.selectedRegionCodes.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {globalDefaults.selectedRegionCodes.map(code => {
                const region = regions.find(r => r.code === code);
                return region ? (
                  <span key={code} className="inline-flex items-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                    {region.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="flex items-center gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Tags</label>
          <select
            multiple
            value={globalDefaults.selectedTagSlugs}
            onChange={(e) => handleMultiSelectChange('selectedTagSlugs', e)}
            className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-6 min-w-[120px]"
            disabled={isUploading}
            size={1}
          >
            {tags.map(tag => (
              <option key={tag.slug} value={tag.slug}>{tag.label}</option>
            ))}
          </select>
          {globalDefaults.selectedTagSlugs.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {globalDefaults.selectedTagSlugs.map(slug => {
                const tag = tags.find(t => t.slug === slug);
                return tag ? (
                  <span key={slug} className="inline-flex items-center rounded-full bg-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                    {tag.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

