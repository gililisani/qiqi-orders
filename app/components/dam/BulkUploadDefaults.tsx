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
        <div className="flex items-start gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap pt-0.5">Locales *</label>
          <div className="flex flex-col gap-1">
            <div className="max-h-20 overflow-y-auto rounded-md border border-gray-300 bg-white p-1 space-y-0.5 min-w-[140px]">
              {locales.length === 0 ? (
                <p className="text-[10px] text-gray-400 italic px-1">No locales</p>
              ) : (
                locales.map(loc => (
                  <label key={loc.code} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={globalDefaults.selectedLocaleCodes.includes(loc.code)}
                      onChange={(e) => {
                        const newLocales = e.target.checked
                          ? [...globalDefaults.selectedLocaleCodes, loc.code]
                          : globalDefaults.selectedLocaleCodes.filter(c => c !== loc.code);
                        handleChange('selectedLocaleCodes', newLocales);
                        if (newLocales.length > 0 && !newLocales.includes(globalDefaults.primaryLocale || '')) {
                          handleChange('primaryLocale', newLocales[0]);
                        }
                      }}
                      className="h-2.5 w-2.5 rounded border-gray-300 text-black focus:ring-black focus:ring-1"
                      disabled={isUploading}
                    />
                    <span className="text-[10px] text-gray-700">{loc.label}</span>
                  </label>
                ))
              )}
            </div>
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
        </div>

        {/* Regions */}
        <div className="flex items-start gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap pt-0.5">Regions</label>
          <div className="flex flex-col gap-1">
            <div className="max-h-20 overflow-y-auto rounded-md border border-gray-300 bg-white p-1 space-y-0.5 min-w-[140px]">
              {regions.length === 0 ? (
                <p className="text-[10px] text-gray-400 italic px-1">No regions (optional)</p>
              ) : (
                regions.map(reg => (
                  <label key={reg.code} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={globalDefaults.selectedRegionCodes.includes(reg.code)}
                      onChange={(e) => {
                        const newRegions = e.target.checked
                          ? [...globalDefaults.selectedRegionCodes, reg.code]
                          : globalDefaults.selectedRegionCodes.filter(c => c !== reg.code);
                        handleChange('selectedRegionCodes', newRegions);
                      }}
                      className="h-2.5 w-2.5 rounded border-gray-300 text-black focus:ring-black focus:ring-1"
                      disabled={isUploading}
                    />
                    <span className="text-[10px] text-gray-700">{reg.label}</span>
                  </label>
                ))
              )}
            </div>
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
        </div>

        {/* Tags */}
        <div className="flex items-start gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap pt-0.5">Tags</label>
          <div className="flex flex-col gap-1">
            <div className="max-h-20 overflow-y-auto rounded-md border border-gray-300 bg-white p-1 space-y-0.5 min-w-[140px]">
              {tags.length === 0 ? (
                <p className="text-[10px] text-gray-400 italic px-1">No tags</p>
              ) : (
                tags.map(tag => (
                  <label key={tag.slug} className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={globalDefaults.selectedTagSlugs.includes(tag.slug)}
                      onChange={(e) => {
                        const newTags = e.target.checked
                          ? [...globalDefaults.selectedTagSlugs, tag.slug]
                          : globalDefaults.selectedTagSlugs.filter(s => s !== tag.slug);
                        handleChange('selectedTagSlugs', newTags);
                      }}
                      className="h-2.5 w-2.5 rounded border-gray-300 text-black focus:ring-black focus:ring-1"
                      disabled={isUploading}
                    />
                    <span className="text-[10px] text-gray-700">{tag.label}</span>
                  </label>
                ))
              )}
            </div>
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
    </div>
  );
}

