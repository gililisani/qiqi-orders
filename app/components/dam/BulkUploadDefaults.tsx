'use client';

import { useState } from 'react';
import { LocaleOption } from './types';

interface BulkUploadDefaultsProps {
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedTagSlugs: string[];
  };
  onGlobalDefaultsChange: (defaults: BulkUploadDefaultsProps['globalDefaults']) => void;
  locales: LocaleOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  campaigns: Array<{ id: string; name: string }>;
  isUploading: boolean;
  accessToken?: string | null;
  onTagsChange?: (tags: Array<{ id: string; slug: string; label: string }>) => void;
}

export default function BulkUploadDefaults({
  globalDefaults,
  onGlobalDefaultsChange,
  locales,
  tags,
  campaigns,
  isUploading,
  accessToken,
  onTagsChange,
}: BulkUploadDefaultsProps) {
  const [newTagLabel, setNewTagLabel] = useState('');

  const handleChange = (field: keyof typeof globalDefaults, value: any) => {
    onGlobalDefaultsChange({ ...globalDefaults, [field]: value });
  };

  const toggleSelection = (list: string[], value: string): string[] => {
    if (list.includes(value)) {
      return list.filter((item) => item !== value);
    }
    return [...list, value];
  };

  const handleAddTag = async () => {
    const trimmed = newTagLabel.trim();
    if (!trimmed) return;

    try {
      if (!accessToken) return;
      const response = await fetch('/api/dam/lookups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add-tag', label: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add tag');
      }

      const data = await response.json();
      if (onTagsChange && data.tags) {
        onTagsChange(data.tags);
      }
      setNewTagLabel('');
    } catch (err: any) {
      alert('Failed to add tag: ' + err.message);
    }
  };

  const handleLocaleToggle = (code: string) => {
    const isSelected = globalDefaults.selectedLocaleCodes.includes(code);
    if (isSelected) {
      if (globalDefaults.selectedLocaleCodes.length === 1) {
        return; // keep at least one locale
      }
      const nextLocales = globalDefaults.selectedLocaleCodes.filter((item) => item !== code);
      const nextPrimary = globalDefaults.primaryLocale === code ? nextLocales[0] ?? null : globalDefaults.primaryLocale;
      handleChange('selectedLocaleCodes', nextLocales);
      handleChange('primaryLocale', nextPrimary);
    } else {
      const newLocales = [...globalDefaults.selectedLocaleCodes, code];
      handleChange('selectedLocaleCodes', newLocales);
      if (!globalDefaults.primaryLocale) {
        handleChange('primaryLocale', code);
      }
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
                locales.map(loc => {
                  const selected = globalDefaults.selectedLocaleCodes.includes(loc.code);
                  return (
                    <div key={loc.code} className="flex items-center justify-between px-1 py-0.5">
                      <label className="flex items-center gap-1.5 cursor-pointer hover:bg-gray-50 rounded flex-1">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleLocaleToggle(loc.code)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-black"
                          disabled={isUploading}
                        />
                        <span className="text-[10px] text-gray-700">{loc.label}</span>
                      </label>
                      {selected && (
                        <label className="flex items-center gap-0.5 text-[9px] text-gray-600">
                          <input
                            type="radio"
                            name="primary-locale-global"
                            checked={globalDefaults.primaryLocale === loc.code}
                            onChange={() => handleChange('primaryLocale', loc.code)}
                            className="h-2.5 w-2.5"
                            disabled={isUploading}
                          />
                          Primary
                        </label>
                      )}
                    </div>
                  );
                })
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

        {/* Tags */}
        <div className="flex items-start gap-1.5">
          <label className="text-xs font-medium text-gray-700 whitespace-nowrap pt-0.5">Tags</label>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-1 min-w-[140px]">
              {tags.map(tag => {
                const selected = globalDefaults.selectedTagSlugs.includes(tag.slug);
                return (
                  <button
                    key={tag.slug}
                    type="button"
                    onClick={() => handleChange('selectedTagSlugs', toggleSelection(globalDefaults.selectedTagSlugs, tag.slug))}
                    disabled={isUploading}
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition ${
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
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={newTagLabel}
                onChange={(event) => setNewTagLabel(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                className="flex-1 rounded-md border border-gray-300 px-1.5 py-0.5 text-[10px] focus:border-black focus:outline-none h-5"
                placeholder="Add new tag"
                disabled={isUploading}
              />
              <button
                type="button"
                onClick={handleAddTag}
                disabled={isUploading}
                className="rounded-md border border-gray-300 px-1.5 py-0.5 text-[10px] font-medium text-gray-700 hover:bg-gray-100 h-5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
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

