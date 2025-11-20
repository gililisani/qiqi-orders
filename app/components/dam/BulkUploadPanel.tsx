'use client';

import { useState, useRef, useCallback } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { LocaleOption, RegionOption } from './types';
import BulkUploadCard from './BulkUploadCard';
import BulkUploadDefaults from './BulkUploadDefaults';

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
  overrides?: {
    productLine?: boolean;
    locales?: boolean;
    regions?: boolean;
    tags?: boolean;
    campaignId?: boolean;
    sku?: boolean;
  };
}

interface BulkUploadPanelProps {
  files: BulkFile[];
  onFilesChange: (files: BulkFile[]) => void;
  onCancel: () => void;
  onUpload: () => Promise<void>;
  globalDefaults: {
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedRegionCodes: string[];
    selectedTagSlugs: string[];
  };
  onGlobalDefaultsChange: (defaults: BulkUploadPanelProps['globalDefaults']) => void;
  locales: LocaleOption[];
  regions: RegionOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
  campaigns: Array<{ id: string; name: string }>;
  isUploading: boolean;
}

export default function BulkUploadPanel({
  files,
  onFilesChange,
  onCancel,
  onUpload,
  globalDefaults,
  onGlobalDefaultsChange,
  locales,
  regions,
  tags,
  assetTypes,
  assetSubtypes,
  products,
  campaigns,
  isUploading,
}: BulkUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const inferAssetType = (fileName: string, mimeType: string): { type: string; typeId: string | null } => {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    
    // Check taxonomy first
    const imageType = assetTypes.find(t => t.slug === 'image');
    const documentType = assetTypes.find(t => t.slug === 'document');
    const artworkType = assetTypes.find(t => t.slug === 'artwork');
    const audioType = assetTypes.find(t => t.slug === 'audio');
    
    if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) || mimeType.startsWith('image/')) {
      return { type: 'image', typeId: imageType?.id || null };
    }
    if (['psd', 'ai', 'eps', 'svg', 'indd'].includes(ext) || mimeType.includes('photoshop') || mimeType.includes('illustrator')) {
      return { type: 'document', typeId: artworkType?.id || null };
    }
    if (['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext) || mimeType.includes('pdf') || mimeType.includes('document')) {
      return { type: 'document', typeId: documentType?.id || null };
    }
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext) || mimeType.startsWith('audio/')) {
      return { type: 'audio', typeId: audioType?.id || null };
    }
    
    return { type: 'other', typeId: documentType?.id || null };
  };

  const handleFileSelect = useCallback((selectedFiles: File[]) => {
    const defaultLocale = locales.find(loc => loc.is_default) || locales[0];
    
    const newFiles: BulkFile[] = selectedFiles.map((file) => {
      const inferred = inferAssetType(file.name, file.type);
      const baseTitle = file.name.replace(/\.[^/.]+$/, '');
      
      return {
        tempId: `bulk-${Date.now()}-${Math.random()}`,
        file,
        inferredAssetType: inferred.type,
        inferredAssetTypeId: inferred.typeId,
        title: baseTitle,
        description: '',
        assetType: inferred.type,
        assetTypeId: inferred.typeId,
        assetSubtypeId: null,
        productLine: globalDefaults.productLine,
        productName: '',
        sku: '',
        selectedTagSlugs: [...globalDefaults.selectedTagSlugs],
        selectedLocaleCodes: globalDefaults.selectedLocaleCodes.length > 0 
          ? [...globalDefaults.selectedLocaleCodes] 
          : (defaultLocale ? [defaultLocale.code] : []),
        primaryLocale: globalDefaults.primaryLocale || (defaultLocale ? defaultLocale.code : null),
        selectedRegionCodes: [...globalDefaults.selectedRegionCodes],
        useTitleAsFilename: false,
        campaignId: globalDefaults.campaignId,
        status: 'pending',
        overrides: {},
      };
    });
    
    onFilesChange([...files, ...newFiles]);
  }, [files, globalDefaults, locales, onFilesChange, assetTypes]);

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    handleFileSelect(selectedFiles);
    
    // Reset input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      handleFileSelect(droppedFiles);
    }
  }, [handleFileSelect]);

  const handleFileFieldChange = (tempId: string, field: keyof BulkFile, value: any) => {
    onFilesChange(files.map(f => 
      f.tempId === tempId ? { ...f, [field]: value } : f
    ));
  };

  const handleRemoveFile = (tempId: string) => {
    onFilesChange(files.filter(f => f.tempId !== tempId));
  };

  const getEffectiveValue = (file: BulkFile, field: 'productLine' | 'campaignId' | 'selectedLocaleCodes' | 'selectedRegionCodes' | 'selectedTagSlugs') => {
    const overrides = file.overrides || {};
    if (field === 'productLine' && overrides.productLine) return file.productLine;
    if (field === 'campaignId' && overrides.campaignId) return file.campaignId;
    if (field === 'selectedLocaleCodes' && overrides.locales) return file.selectedLocaleCodes;
    if (field === 'selectedRegionCodes' && overrides.regions) return file.selectedRegionCodes;
    if (field === 'selectedTagSlugs' && overrides.tags) return file.selectedTagSlugs;
    return globalDefaults[field];
  };

  const canUpload = files.length > 0 && files.every(f => {
    const effectiveLocales = getEffectiveValue(f, 'selectedLocaleCodes') as string[];
    return f.title.trim() && 
      f.assetTypeId && 
      f.assetSubtypeId && 
      effectiveLocales.length > 0 &&
      (f.primaryLocale || effectiveLocales[0]) &&
      f.status !== 'uploading';
  });

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header - Fixed at top */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-white sticky top-0 z-10">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Bulk Upload</h3>
          <p className="text-xs text-gray-500 mt-0.5">{files.length} file{files.length !== 1 ? 's' : ''} selected</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={!canUpload || isUploading}
            className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            {isUploading ? 'Uploading...' : `Upload ${files.length} Asset${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Global Defaults Bar - Compact horizontal */}
      {files.length > 0 && (
        <BulkUploadDefaults
          globalDefaults={globalDefaults}
          onGlobalDefaultsChange={onGlobalDefaultsChange}
          locales={locales}
          regions={regions}
          tags={tags}
          campaigns={campaigns}
          isUploading={isUploading}
        />
      )}

      {/* File Selector / Drop Zone */}
      <div className="px-4 py-3 border-b border-gray-200">
        <label className="block text-xs font-medium text-gray-700 mb-2">Select Files</label>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-black file:text-white hover:file:opacity-90"
          disabled={isUploading}
        />
      </div>

      {/* File Grid - Scrollable */}
      <div
        className={`p-4 ${isDragging ? 'bg-blue-50 border-2 border-blue-400 border-dashed' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {files.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-lg">
            <p className="text-sm text-gray-500 mb-2">Drag and drop files here</p>
            <p className="text-xs text-gray-400">or use the file selector above</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {files.map((file) => (
              <BulkUploadCard
                key={file.tempId}
                file={file}
                onFieldChange={handleFileFieldChange}
                onRemove={handleRemoveFile}
                assetTypes={assetTypes}
                assetSubtypes={assetSubtypes}
                products={products}
                locales={locales}
                regions={regions}
                tags={tags}
                globalDefaults={globalDefaults}
                getEffectiveValue={getEffectiveValue}
                isUploading={isUploading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
