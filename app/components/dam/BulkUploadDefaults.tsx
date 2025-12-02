'use client';

import { LocaleOption } from './types';

interface BulkUploadDefaultsProps {
  globalDefaults: {
    assetSubtypeId: string | null;
    productLine: string;
    selectedTagSlugs: string[];
    selectedLocaleCodes: string[];
    campaignId: string | null;
  };
  onGlobalDefaultsChange: (defaults: BulkUploadDefaultsProps['globalDefaults']) => void;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  campaigns: Array<{ id: string; name: string }>;
  productLines: Array<{ code: string; name: string }>;
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  locales: LocaleOption[];
  isUploading: boolean;
}

export default function BulkUploadDefaults({
  globalDefaults,
  onGlobalDefaultsChange,
  assetSubtypes,
  campaigns,
  productLines,
  tags,
  locales,
  isUploading,
}: BulkUploadDefaultsProps) {
  const handleChange = (field: keyof typeof globalDefaults, value: any) => {
    onGlobalDefaultsChange({ ...globalDefaults, [field]: value });
  };

  const toggleTag = (tagSlug: string) => {
    const currentTags = globalDefaults.selectedTagSlugs || [];
    if (currentTags.includes(tagSlug)) {
      handleChange('selectedTagSlugs', currentTags.filter(slug => slug !== tagSlug));
    } else {
      handleChange('selectedTagSlugs', [...currentTags, tagSlug]);
    }
  };

  const toggleLocale = (localeCode: string) => {
    const currentLocales = globalDefaults.selectedLocaleCodes || [];
    if (currentLocales.includes(localeCode)) {
      if (currentLocales.length === 1) return; // Keep at least one locale
      handleChange('selectedLocaleCodes', currentLocales.filter(code => code !== localeCode));
    } else {
      handleChange('selectedLocaleCodes', [...currentLocales, localeCode]);
    }
  };


  return (
    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
      <div className="space-y-2">
        <p className="text-xs text-gray-500 italic">Global defaults apply only to newly added files</p>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* Sub-type */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium text-gray-700 whitespace-nowrap">Sub-type</label>
            <select
              value={globalDefaults.assetSubtypeId || ''}
              onChange={(e) => handleChange('assetSubtypeId', e.target.value || null)}
              className="rounded-md border border-gray-300 px-2 py-0.5 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-6 min-w-[100px]"
              disabled={isUploading}
            >
              <option value="">None</option>
              {assetSubtypes.map(subtype => (
                <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
              ))}
            </select>
          </div>

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

        {/* Tags */}
        <div className="flex items-start gap-2">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap pt-0.5">Tags:</label>
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => {
              const selected = globalDefaults.selectedTagSlugs.includes(tag.slug);
              return (
                <button
                  key={tag.slug}
                  type="button"
                  onClick={() => toggleTag(tag.slug)}
                  disabled={isUploading}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
                    selected
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {tag.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Locales */}
        <div className="flex items-start gap-2">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap pt-0.5">Locales:</label>
          <div className="flex flex-wrap gap-1">
            {locales.map((locale) => {
              const selected = globalDefaults.selectedLocaleCodes.includes(locale.code);
              return (
                <button
                  key={locale.code}
                  type="button"
                  onClick={() => toggleLocale(locale.code)}
                  disabled={isUploading || (!selected && globalDefaults.selectedLocaleCodes.length === 0)}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
                    selected
                      ? 'border-black bg-black text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {locale.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

