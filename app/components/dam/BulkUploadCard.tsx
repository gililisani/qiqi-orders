'use client';

import { useState } from 'react';
import { TrashIcon, ChevronDownIcon, ChevronUpIcon, PhotoIcon, DocumentTextIcon, FilmIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { LocaleOption, RegionOption } from './types';

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
  selectedRegionCodes: string[];
  useTitleAsFilename: boolean;
  campaignId: string | null;
  status?: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  previewUrl?: string | null; // Thumbnail preview URL (object URL for images, data URL for PDFs)
  overrides?: {
    productLine?: boolean;
    locales?: boolean;
    regions?: boolean;
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
  regions: RegionOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  campaigns: Array<{ id: string; name: string }>;
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedRegionCodes: string[];
    selectedTagSlugs: string[];
  };
  getEffectiveValue: (file: BulkFile, field: 'productLine' | 'campaignId' | 'selectedLocaleCodes' | 'selectedRegionCodes' | 'selectedTagSlugs') => any;
  isUploading: boolean;
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
  regions,
  tags,
  campaigns,
  globalDefaults,
  getEffectiveValue,
  isUploading,
}: BulkUploadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

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
  const effectiveRegions = getEffectiveValue(file, 'selectedRegionCodes') as string[];
  const effectiveTags = getEffectiveValue(file, 'selectedTagSlugs') as string[];

  const handlePerFileOverride = (field: 'productLine' | 'locales' | 'regions' | 'tags' | 'campaignId' | 'sku', value: any) => {
    const overrides = { ...(file.overrides || {}), [field]: true };
    onFieldChange(file.tempId, field as keyof BulkFile, value);
    onFieldChange(file.tempId, 'overrides', overrides);
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
              value={file.productLine}
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
              value={file.campaignId || ''}
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
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Tags (override)</label>
            <select
              multiple
              value={file.selectedTagSlugs}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                handlePerFileOverride('tags', selected);
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black min-h-[50px]"
              disabled={isUploading || file.status === 'uploading'}
            >
              {tags.map(tag => (
                <option key={tag.slug} value={tag.slug}>{tag.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Locales (override)</label>
            <select
              multiple
              value={file.selectedLocaleCodes}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                handlePerFileOverride('locales', selected);
                if (selected.length > 0 && !selected.includes(file.primaryLocale || '')) {
                  onFieldChange(file.tempId, 'primaryLocale', selected[0]);
                }
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black min-h-[50px]"
              disabled={isUploading || file.status === 'uploading'}
            >
              {locales.map(loc => (
                <option key={loc.code} value={loc.code}>{loc.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-0.5">Regions (override)</label>
            <select
              multiple
              value={file.selectedRegionCodes}
              onChange={(e) => {
                const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                handlePerFileOverride('regions', selected);
              }}
              className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none focus:ring-1 focus:ring-black min-h-[50px]"
              disabled={isUploading || file.status === 'uploading'}
            >
              {regions.map(reg => (
                <option key={reg.code} value={reg.code}>{reg.label}</option>
              ))}
            </select>
            <p className="text-[10px] text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
          </div>
        </div>
      )}
    </div>
  );
}

