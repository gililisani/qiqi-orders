'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { LocaleOption, RegionOption, AssetRecord } from './types';
import { ensureTokenUrl } from './utils';
import BulkUploadCard from './BulkUploadCard';
import BulkUploadDefaults from './BulkUploadDefaults';

import { Card } from '../qq/card';
import { Button } from '../qq/button';

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
    assetTypeId?: boolean;
    assetSubtypeId?: boolean;
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
    assetSubtypeId: string | null;
    productLine: string;
    selectedTagSlugs: string[];
    selectedLocaleCodes: string[];
    campaignId: string | null;
  };
  onGlobalDefaultsChange: (defaults: BulkEditPanelProps['globalDefaults']) => void;
  locales: LocaleOption[];
  allLocales?: LocaleOption[]; // All locales including inactive (for showing current values)
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
  productLines: Array<{ code: string; name: string }>;
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
  allLocales,
  tags,
  assetTypes,
  assetSubtypes,
  products,
  productLines,
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

  const getEffectiveValue = (file: BulkEditFile, field: 'assetSubtypeId' | 'productLine' | 'selectedTagSlugs' | 'selectedLocaleCodes' | 'campaignId') => {
    const overrides = file.overrides || {};
    // If field is overridden, use file's value
    if (field === 'assetSubtypeId' && overrides.assetSubtypeId) return file.assetSubtypeId;
    if (field === 'productLine' && overrides.productLine) return file.productLine;
    if (field === 'selectedTagSlugs' && overrides.tags) return file.selectedTagSlugs;
    if (field === 'selectedLocaleCodes' && overrides.locales) return file.selectedLocaleCodes;
    if (field === 'campaignId' && overrides.campaignId) return file.campaignId;
    // If not overridden, use global default
    // For assetSubtypeId, only apply if the file's Type matches the subtype's parent type
    if (field === 'assetSubtypeId' && globalDefaults.assetSubtypeId) {
      const globalSubtype = assetSubtypes.find(st => st.id === globalDefaults.assetSubtypeId);
      // Only apply if file's Type matches the subtype's parent type
      if (globalSubtype && file.assetTypeId === globalSubtype.asset_type_id) {
        return globalDefaults.assetSubtypeId;
      }
      // If types don't match, return null (no global default applied)
      return null;
    }
    return globalDefaults[field];
  };

  // Wrapper function to convert BulkFile to BulkEditFile for getEffectiveValue
  const getEffectiveValueWrapper = (file: any, field: 'assetSubtypeId' | 'productLine' | 'selectedTagSlugs' | 'selectedLocaleCodes' | 'campaignId') => {
    // Find the corresponding BulkEditFile by tempId
    const editFile = assets.find(a => a.assetId === file.tempId);
    if (!editFile) {
      // Fallback to global defaults if asset not found
      return globalDefaults[field];
    }
    return getEffectiveValue(editFile, field);
  };

  const canSave = assets.length > 0 && assets.every(f => {
    const effectiveLocales = f.selectedLocaleCodes || [];
    return f.title.trim() && 
      f.assetTypeId && 
      f.assetSubtypeId && 
      effectiveLocales.length > 0 &&
      (f.primaryLocale || effectiveLocales[0]) &&
      f.status !== 'saving';
  });

  return (
    <Card className="mb-6 overflow-hidden">
      {/* Header - sticky at top */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-background sticky top-0 z-10">
        <div>
          <h3 className="text-sm font-semibold">Bulk edit</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {assets.length} asset{assets.length !== 1 ? 's' : ''} selected
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={onSave}
            disabled={!canSave || isSaving}
            loading={isSaving}
          >
            <Pencil className="h-3.5 w-3.5" />
            {isSaving
              ? 'Saving…'
              : `Save ${assets.length} asset${assets.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      </div>

      {/* Global Defaults Bar - Compact horizontal */}
      {assets.length > 0 && (
        <BulkUploadDefaults
          globalDefaults={globalDefaults}
          onGlobalDefaultsChange={onGlobalDefaultsChange}
          assetTypes={assetTypes}
          assetSubtypes={assetSubtypes}
          campaigns={campaigns}
          productLines={productLines}
          tags={tags}
          locales={locales}
          isUploading={isSaving}
        />
      )}

      {/* Asset grid */}
      <div className="p-4">
        {assets.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-border rounded-md">
            <p className="text-sm text-muted-foreground">No assets selected.</p>
          </div>
        ) : (
          <div className="rounded-md border border-border bg-muted/30 p-4">
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
                  productLines={productLines}
                  locales={locales}
                  allLocales={allLocales}
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
    </Card>
  );
}

