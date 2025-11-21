'use client';

import { useState } from 'react';
import { TrashIcon, ChevronDownIcon, ChevronUpIcon, PhotoIcon, DocumentTextIcon, FilmIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { LocaleOption } from './types';

interface BulkFile {
  tempId: string;
  file: File;
  inferredAssetType: string;
  inferredAssetTypeId: string | null;
  title: string;
  description: string;
  assetType: string;
  assetTypeId: string | null;
  assetSubtypeId: string | null;
  productLine: string;
  productName: string;
  sku: string;
  selectedTagSlugs: string[];
  selectedLocaleCodes: string[];
  primaryLocale: string | null;
  useTitleAsFilename: boolean;
  campaignId: string | null;
  status?: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  previewUrl?: string | null; // Thumbnail preview URL (object URL for images, data URL for PDFs)
  overrides?: {
    productLine?: boolean;
    locales?: boolean;
    tags?: boolean;
    campaignId?: boolean;
    sku?: boolean;
  };
}

interface BulkUploadCardProps {
  file: BulkFile;
  onFieldChange: (tempId: string, field: keyof BulkFile, value: any) => void;
  onFieldsChange?: (tempId: string, updates: Partial<BulkFile>) => void;
  onRemove: (tempId: string) => void;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
  locales: LocaleOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  campaigns: Array<{ id: string; name: string }>;
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedTagSlugs: string[];
  };
  getEffectiveValue: (file: BulkFile, field: 'productLine' | 'campaignId' | 'selectedLocaleCodes' | 'selectedTagSlugs') => any;
  isUploading: boolean;
  accessToken?: string | null;
  onTagsChange?: (tags: Array<{ id: string; slug: string; label: string }>) => void;
}

export default function BulkUploadCard({
  file,
  onFieldChange,
  onFieldsChange,
  onRemove,
  assetTypes,
  assetSubtypes,
  products,
  locales,
  tags,
  campaigns,
  globalDefaults,
  getEffectiveValue,
  isUploading,
  accessToken,
  onTagsChange,
}: BulkUploadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');

  const getFileIcon = () => {
    if (file.assetType === 'image') return <PhotoIcon className="h-12 w-12 text-blue-500" />;
    if (file.assetType === 'document' || file.assetType === 'artwork') return <DocumentTextIcon className="h-12 w-12 text-green-500" />;
    if (file.assetType === 'video') return <FilmIcon className="h-12 w-12 text-purple-500" />;
    return <DocumentTextIcon className="h-12 w-12 text-gray-500" />;
  };

  const renderThumbnail = () => {
    // Show thumbnail if available (images or PDFs)
    if (file.previewUrl) {
      return (
        <img
          src={file.previewUrl}
          alt={file.file.name}
          className="h-12 w-12 rounded object-cover border border-gray-200"
          onError={(e) => {
            // Fallback to icon if image fails to load
            e.currentTarget.style.display = 'none';
          }}
        />
      );
    }
    // Fallback to icon
    return getFileIcon();
  };

  const effectiveProductLine = getEffectiveValue(file, 'productLine') as string;
  const effectiveCampaignId = getEffectiveValue(file, 'campaignId') as string | null;
  const effectiveLocales = getEffectiveValue(file, 'selectedLocaleCodes') as string[];
  const effectiveTags = getEffectiveValue(file, 'selectedTagSlugs') as string[];

  const toggleSelection = (list: string[], value: string): string[] => {
    if (list.includes(value)) {
      return list.filter((item) => item !== value);
    }
    return [...list, value];
  };

  const handleLocaleToggle = (code: string) => {
    const isSelected = effectiveLocales.includes(code);
    if (isSelected) {
      if (effectiveLocales.length === 1) {
        return; // keep at least one locale
      }
      const nextLocales = effectiveLocales.filter((item) => item !== code);
      const nextPrimary = file.primaryLocale === code ? nextLocales[0] ?? null : file.primaryLocale;
      handlePerFileOverride('locales', nextLocales);
      onFieldChange(file.tempId, 'primaryLocale', nextPrimary);
    } else {
      const newLocales = [...effectiveLocales, code];
      handlePerFileOverride('locales', newLocales);
      if (!file.primaryLocale) {
        onFieldChange(file.tempId, 'primaryLocale', code);
      }
    }
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

  const handlePerFileOverride = (field: 'productLine' | 'locales' | 'tags' | 'campaignId' | 'sku', value: any) => {
    const overrides = { ...(file.overrides || {}), [field]: true };
    // Use atomic update if available, otherwise fall back to separate calls
    if (onFieldsChange) {
      onFieldsChange(file.tempId, {
        [field]: value,
        overrides: overrides,
      });
    } else {
      onFieldChange(file.tempId, field as keyof BulkFile, value);
      onFieldChange(file.tempId, 'overrides', overrides);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm hover:shadow transition-shadow">
      {/* Card Header */}
      <div className="flex items-start gap-2 p-2.5 border-b border-gray-100">
        <div className="flex-shrink-0">
          {renderThumbnail()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-gray-900 truncate">{file.file.name}</p>
          <p className="text-xs text-gray-500">{(file.file.size / 1024).toFixed(1)} KB</p>
        </div>
        <button
          type="button"
          onClick={() => onRemove(file.tempId)}
          disabled={isUploading || file.status === 'uploading'}
          className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:text-red-600 disabled:opacity-50 transition"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Status */}
      {file.status === 'uploading' && (
        <div className="px-2.5 py-1 text-xs text-blue-600 bg-blue-50 border-b border-gray-100">Uploading...</div>
      )}
      {file.status === 'success' && (
        <div className="px-2.5 py-1 text-xs text-green-600 bg-green-50 border-b border-gray-100">✓ Uploaded</div>
      )}
      {file.status === 'error' && file.error && (
        <div className="px-2.5 py-1 text-xs text-red-600 bg-red-50 border-b border-gray-100">✗ {file.error}</div>
      )}

      {/* Main Fields */}
      <div className="p-2.5 space-y-1">
        <div>
          <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Title *</label>
          <input
            type="text"
            value={file.title}
            onChange={(e) => onFieldChange(file.tempId, 'title', e.target.value)}
            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
            disabled={isUploading || file.status === 'uploading'}
          />
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Type *</label>
            <select
              value={file.assetTypeId || ''}
              onChange={(e) => {
                const selectedTypeId = e.target.value || null;
                const selectedType = assetTypes.find(t => t.id === selectedTypeId);
                const slugToEnumMap: Record<string, string> = {
                  'image': 'image',
                  'video': 'video',
                  'document': 'document',
                  'artwork': 'document',
                  'audio': 'audio',
                  'packaging-regulatory': 'document',
                  'campaign': 'document',
                };
                // Update all related fields atomically
                if (onFieldsChange) {
                  onFieldsChange(file.tempId, {
                    assetTypeId: selectedTypeId,
                    assetType: selectedType ? slugToEnumMap[selectedType.slug] || 'other' : 'other',
                    assetSubtypeId: null, // Reset subtype when type changes
                  });
                } else {
                  onFieldChange(file.tempId, 'assetTypeId', selectedTypeId);
                  onFieldChange(file.tempId, 'assetType', selectedType ? slugToEnumMap[selectedType.slug] || 'other' : 'other');
                  onFieldChange(file.tempId, 'assetSubtypeId', null);
                }
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
              disabled={isUploading || file.status === 'uploading'}
            >
              <option value="">Select</option>
              {assetTypes.map(type => (
                <option key={type.id} value={type.id}>{type.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Sub-Type *</label>
            <select
              value={file.assetSubtypeId || ''}
              onChange={(e) => onFieldChange(file.tempId, 'assetSubtypeId', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
              disabled={isUploading || file.status === 'uploading' || !file.assetTypeId}
            >
              <option value="">Select</option>
              {assetSubtypes
                .filter(st => st.asset_type_id === file.assetTypeId)
                .map(subtype => (
                  <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Product</label>
            <select
              value={file.productName || ''}
              onChange={(e) => {
                const selectedValue = e.target.value;
                const selectedProduct = products.find(p => p.item_name === selectedValue);
                // Update both fields atomically if onFieldsChange is available, otherwise update separately
                if (onFieldsChange) {
                  onFieldsChange(file.tempId, {
                    productName: selectedValue,
                    sku: selectedProduct?.sku || '',
                  });
                } else {
                  onFieldChange(file.tempId, 'productName', selectedValue);
                  onFieldChange(file.tempId, 'sku', selectedProduct?.sku || '');
                }
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
              disabled={isUploading || file.status === 'uploading'}
            >
              <option value="">None</option>
              {products.map(product => (
                <option key={product.id} value={product.item_name}>{product.item_name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* More Metadata Toggle */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-2.5 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 border-t border-gray-100 transition"
        disabled={isUploading || file.status === 'uploading'}
      >
        <span>More metadata</span>
        {isExpanded ? (
          <ChevronUpIcon className="h-4 w-4" />
        ) : (
          <ChevronDownIcon className="h-4 w-4" />
        )}
      </button>

      {/* Expanded Metadata */}
      {isExpanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5 border-t border-gray-100 bg-gray-50">
          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Description</label>
            <textarea
              value={file.description}
              onChange={(e) => onFieldChange(file.tempId, 'description', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black resize-none h-16"
              disabled={isUploading || file.status === 'uploading'}
              placeholder="Asset description"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Product Line (override)</label>
            <select
              value={effectiveProductLine}
              onChange={(e) => handlePerFileOverride('productLine', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
              disabled={isUploading || file.status === 'uploading'}
            >
              <option value="">None</option>
              <option value="ProCtrl">ProCtrl</option>
              <option value="SelfCtrl">SelfCtrl</option>
              <option value="Both">Both</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Campaign (override)</label>
            <select
              value={effectiveCampaignId || ''}
              onChange={(e) => handlePerFileOverride('campaignId', e.target.value || null)}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
              disabled={isUploading || file.status === 'uploading'}
            >
              <option value="">None</option>
              {campaigns.map(campaign => (
                <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">SKU</label>
            <input
              type="text"
              value={file.sku}
              onChange={(e) => handlePerFileOverride('sku', e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black h-7"
              disabled={isUploading || file.status === 'uploading'}
              placeholder="Auto-filled from product"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Tags (override)</label>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">
                {tags.map((tag) => {
                  const selected = effectiveTags.includes(tag.slug);
                  return (
                    <button
                      type="button"
                      key={tag.slug}
                      onClick={() => handlePerFileOverride('tags', toggleSelection(effectiveTags, tag.slug))}
                      disabled={isUploading || file.status === 'uploading'}
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
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-[10px] focus:border-black focus:outline-none h-6"
                  placeholder="Add new tag"
                  disabled={isUploading || file.status === 'uploading'}
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  disabled={isUploading || file.status === 'uploading'}
                  className="rounded-md border border-gray-300 px-2 py-1 text-[10px] font-medium text-gray-700 hover:bg-gray-100 h-6 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Locales (override)</label>
            <div className="space-y-1">
              {locales.map((locale) => {
                const selected = effectiveLocales.includes(locale.code);
                return (
                  <div key={locale.code} className="flex items-center justify-between rounded-md border border-gray-200 px-2 py-1">
                    <label className="flex items-center gap-1.5 text-[10px] text-gray-700">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleLocaleToggle(locale.code)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-black"
                        disabled={isUploading || file.status === 'uploading'}
                      />
                      <span>{locale.label}</span>
                    </label>
                    {selected && (
                      <label className="flex items-center gap-1 text-[9px] text-gray-600">
                        <input
                          type="radio"
                          name={`primary-locale-${file.tempId}`}
                          checked={file.primaryLocale === locale.code}
                          onChange={() => onFieldChange(file.tempId, 'primaryLocale', locale.code)}
                          className="h-2.5 w-2.5"
                          disabled={isUploading || file.status === 'uploading'}
                        />
                        Primary
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

