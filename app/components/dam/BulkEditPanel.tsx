'use client';

import { useState } from 'react';
import { PencilIcon } from '@heroicons/react/24/outline';
import { LocaleOption, RegionOption, AssetRecord } from './types';
import { ensureTokenUrl } from './utils';
import BulkUploadCard from './BulkUploadCard';
import BulkUploadDefaults from './BulkUploadDefaults';

interface BulkEditFile {
  assetId: string;
  asset: AssetRecord;
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
  status?: 'pending' | 'saving' | 'success' | 'error';
  error?: string;
  overrides?: {
    productLine?: boolean;
    locales?: boolean;
    tags?: boolean;
    campaignId?: boolean;
    sku?: boolean;
  };
}

interface BulkEditPanelProps {
  assets: BulkEditFile[];
  onAssetsChange: (assets: BulkEditFile[]) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedTagSlugs: string[];
  };
  onGlobalDefaultsChange: (defaults: BulkEditPanelProps['globalDefaults']) => void;
  locales: LocaleOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
  campaigns: Array<{ id: string; name: string }>;
  isSaving: boolean;
  accessToken: string | null;
  onTagsChange?: (tags: Array<{ id: string; slug: string; label: string }>) => void;
}

export default function BulkEditPanel({
  assets,
  onAssetsChange,
  onCancel,
  onSave,
  globalDefaults,
  onGlobalDefaultsChange,
  locales,
  tags,
  assetTypes,
  assetSubtypes,
  products,
  campaigns,
  isSaving,
  accessToken,
  onTagsChange,
}: BulkEditPanelProps) {
  const handleAssetFieldChange = (assetId: string, field: keyof BulkEditFile, value: any) => {
    onAssetsChange(assets.map(a => 
      a.assetId === assetId ? { ...a, [field]: value } : a
    ));
  };

  const handleAssetFieldsChange = (assetId: string, updates: Partial<BulkEditFile>) => {
    onAssetsChange(assets.map(a => 
      a.assetId === assetId ? { ...a, ...updates } : a
    ));
  };

  const handleRemoveAsset = (assetId: string) => {
    onAssetsChange(assets.filter(a => a.assetId !== assetId));
  };

  const getEffectiveValue = (file: BulkEditFile, field: 'productLine' | 'campaignId' | 'selectedLocaleCodes' | 'selectedTagSlugs') => {
    const overrides = file.overrides || {};
    if (field === 'productLine' && overrides.productLine) return file.productLine;
    if (field === 'campaignId' && overrides.campaignId) return file.campaignId;
    if (field === 'selectedLocaleCodes' && overrides.locales) return file.selectedLocaleCodes;
    if (field === 'selectedTagSlugs' && overrides.tags) return file.selectedTagSlugs;
    return globalDefaults[field];
  };

  // Wrapper function to convert BulkFile to BulkEditFile for getEffectiveValue
  const getEffectiveValueWrapper = (file: any, field: 'productLine' | 'campaignId' | 'selectedLocaleCodes' | 'selectedTagSlugs') => {
    // Find the corresponding BulkEditFile by tempId
    const editFile = assets.find(a => a.assetId === file.tempId);
    if (!editFile) {
      // Fallback to global defaults if asset not found
      return globalDefaults[field];
    }
    return getEffectiveValue(editFile, field);
  };

  const canSave = assets.length > 0 && assets.every(f => {
    const effectiveLocales = getEffectiveValue(f, 'selectedLocaleCodes') as string[];
    return f.title.trim() && 
      f.assetTypeId && 
      f.assetSubtypeId && 
      effectiveLocales.length > 0 &&
      (f.primaryLocale || effectiveLocales[0]) &&
      f.status !== 'saving';
  });

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header - Fixed at top */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-white sticky top-0 z-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Bulk Edit</h3>
          <p className="text-xs text-gray-500 mt-0.5">{assets.length} asset{assets.length !== 1 ? 's' : ''} selected</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave || isSaving}
            className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <PencilIcon className="h-4 w-4" />
            {isSaving ? 'Saving...' : `Save ${assets.length} Asset${assets.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Global Defaults Bar - Compact horizontal */}
      {assets.length > 0 && (
        <BulkUploadDefaults
          globalDefaults={globalDefaults}
          onGlobalDefaultsChange={onGlobalDefaultsChange}
          locales={locales}
          tags={tags}
          campaigns={campaigns}
          isUploading={isSaving}
          accessToken={accessToken}
          onTagsChange={onTagsChange}
        />
      )}

      {/* Asset Grid - Scrollable */}
      <div className="p-4">
        {assets.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-sm text-gray-500">No assets selected</p>
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-gray-300 bg-[#fafafa] p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {assets.map((asset) => {
                // Create a dummy file for BulkUploadCard compatibility
                // The card will use previewUrl if available
                const dummyFile = new File([], asset.asset.title || 'asset', {
                  type: asset.asset.current_version?.mime_type || 'application/octet-stream',
                });
                
                return (
                  <BulkUploadCard
                    key={asset.assetId}
                    file={{
                      tempId: asset.assetId,
                      file: dummyFile,
                      inferredAssetType: asset.assetType,
                      inferredAssetTypeId: asset.assetTypeId,
                      title: asset.title,
                      description: asset.description,
                      assetType: asset.assetType,
                      assetTypeId: asset.assetTypeId,
                      assetSubtypeId: asset.assetSubtypeId,
                      productLine: asset.productLine,
                      productName: asset.productName,
                      sku: asset.sku,
                      selectedTagSlugs: asset.selectedTagSlugs,
                      selectedLocaleCodes: asset.selectedLocaleCodes,
                      primaryLocale: asset.primaryLocale,
                      useTitleAsFilename: asset.useTitleAsFilename,
                      campaignId: asset.campaignId,
                      status: asset.status === 'saving' ? 'uploading' : asset.status,
                      error: asset.error,
                      overrides: asset.overrides,
                      previewUrl: asset.asset.current_version?.previewPath 
                        ? ensureTokenUrl(asset.asset.current_version.previewPath, accessToken)
                        : null, // Use actual preview URL with token
                    }}
                  onFieldChange={(tempId, field, value) => handleAssetFieldChange(tempId, field as keyof BulkEditFile, value)}
                  onFieldsChange={(tempId, updates) => handleAssetFieldsChange(tempId, updates as Partial<BulkEditFile>)}
                  onRemove={handleRemoveAsset}
                  assetTypes={assetTypes}
                  assetSubtypes={assetSubtypes}
                  products={products}
                  locales={locales}
                  tags={tags}
                  campaigns={campaigns}
                  globalDefaults={globalDefaults}
                  getEffectiveValue={getEffectiveValueWrapper}
                  isUploading={isSaving}
                  accessToken={accessToken}
                  onTagsChange={onTagsChange}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

