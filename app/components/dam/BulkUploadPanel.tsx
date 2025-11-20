'use client';

import { useState, useRef } from 'react';
import { XMarkIcon, TrashIcon, PhotoIcon, DocumentTextIcon, FilmIcon, MusicalNoteIcon } from '@heroicons/react/24/outline';
import { LocaleOption, RegionOption, VimeoDownloadFormat } from './types';

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
  onGlobalDefaultsChange: (defaults: Partial<BulkUploadPanelProps['globalDefaults']>) => void;
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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
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
      };
    });
    
    onFilesChange([...files, ...newFiles]);
    
    // Reset input so same files can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveFile = (tempId: string) => {
    onFilesChange(files.filter(f => f.tempId !== tempId));
  };

  const handleFileFieldChange = (tempId: string, field: keyof BulkFile, value: any) => {
    onFilesChange(files.map(f => 
      f.tempId === tempId ? { ...f, [field]: value } : f
    ));
  };

  const handleGlobalDefaultChange = (field: keyof typeof globalDefaults, value: any) => {
    const newDefaults = { ...globalDefaults, [field]: value };
    onGlobalDefaultsChange(newDefaults);
    
    // Apply to all files that haven't been manually overridden
    onFilesChange(files.map(f => {
      if (field === 'productLine' && f.productLine === globalDefaults.productLine) {
        return { ...f, productLine: value };
      }
      if (field === 'selectedLocaleCodes' && JSON.stringify(f.selectedLocaleCodes) === JSON.stringify(globalDefaults.selectedLocaleCodes)) {
        return { ...f, selectedLocaleCodes: [...value], primaryLocale: value[0] || f.primaryLocale };
      }
      if (field === 'selectedRegionCodes' && JSON.stringify(f.selectedRegionCodes) === JSON.stringify(globalDefaults.selectedRegionCodes)) {
        return { ...f, selectedRegionCodes: [...value] };
      }
      if (field === 'selectedTagSlugs' && JSON.stringify(f.selectedTagSlugs) === JSON.stringify(globalDefaults.selectedTagSlugs)) {
        return { ...f, selectedTagSlugs: [...value] };
      }
      if (field === 'campaignId' && f.campaignId === globalDefaults.campaignId) {
        return { ...f, campaignId: value };
      }
      return f;
    }));
  };

  const getFileIcon = (file: BulkFile) => {
    if (file.assetType === 'image') return <PhotoIcon className="h-6 w-6 text-blue-500" />;
    if (file.assetType === 'document' || file.assetType === 'artwork') return <DocumentTextIcon className="h-6 w-6 text-green-500" />;
    if (file.assetType === 'video') return <FilmIcon className="h-6 w-6 text-purple-500" />;
    if (file.assetType === 'audio') return <MusicalNoteIcon className="h-6 w-6 text-pink-500" />;
    return <DocumentTextIcon className="h-6 w-6 text-gray-500" />;
  };

  const canUpload = files.length > 0 && files.every(f => 
    f.title.trim() && 
    f.assetTypeId && 
    f.assetSubtypeId && 
    f.selectedLocaleCodes.length > 0 &&
    f.primaryLocale &&
    f.status !== 'uploading'
  );

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Bulk Upload</h3>
          <p className="text-xs text-gray-500 mt-0.5">Select files and set metadata before uploading</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isUploading}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onUpload}
            disabled={!canUpload || isUploading}
            className="rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? 'Uploading...' : `Upload ${files.length} Asset${files.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Content - Scrollable */}
      <div className="max-h-[600px] overflow-y-auto px-4 py-4">
        {/* File Selector */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-700 mb-2">Select Files</label>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="block w-full text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-black file:text-white hover:file:opacity-90"
            disabled={isUploading}
          />
        </div>

        {/* Global Defaults */}
        {files.length > 0 && (
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">Global Defaults</h4>
            <p className="text-xs text-gray-500 mb-3">These defaults apply to all new assets (you can override per file).</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Product Line</label>
                <select
                  value={globalDefaults.productLine}
                  onChange={(e) => handleGlobalDefaultChange('productLine', e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
                  disabled={isUploading}
                >
                  <option value="">None</option>
                  <option value="ProCtrl">ProCtrl</option>
                  <option value="SelfCtrl">SelfCtrl</option>
                  <option value="Both">Both</option>
                </select>
              </div>

              {campaigns.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Campaign (Optional)</label>
                  <select
                    value={globalDefaults.campaignId || ''}
                    onChange={(e) => handleGlobalDefaultChange('campaignId', e.target.value || null)}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
                    disabled={isUploading}
                  >
                    <option value="">None</option>
                    {campaigns.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Locales *</label>
                <select
                  multiple
                  value={globalDefaults.selectedLocaleCodes}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    handleGlobalDefaultChange('selectedLocaleCodes', selected);
                    if (selected.length > 0 && !selected.includes(globalDefaults.primaryLocale || '')) {
                      handleGlobalDefaultChange('primaryLocale', selected[0]);
                    }
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[60px]"
                  disabled={isUploading}
                >
                  {locales.map(loc => (
                    <option key={loc.code} value={loc.code}>{loc.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Hold Ctrl/Cmd to select multiple</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Regions (Optional)</label>
                <select
                  multiple
                  value={globalDefaults.selectedRegionCodes}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    handleGlobalDefaultChange('selectedRegionCodes', selected);
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[60px]"
                  disabled={isUploading}
                >
                  {regions.map(reg => (
                    <option key={reg.code} value={reg.code}>{reg.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Hold Ctrl/Cmd to select multiple</p>
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tags (Optional)</label>
                <select
                  multiple
                  value={globalDefaults.selectedTagSlugs}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    handleGlobalDefaultChange('selectedTagSlugs', selected);
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[60px]"
                  disabled={isUploading}
                >
                  {tags.map(tag => (
                    <option key={tag.slug} value={tag.slug}>{tag.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Hold Ctrl/Cmd to select multiple</p>
              </div>
            </div>
          </div>
        )}

        {/* Per-File Cards */}
        {files.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-900">Files ({files.length})</h4>
            {files.map((file) => (
              <div key={file.tempId} className="rounded-md border border-gray-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  {/* Thumbnail/Icon */}
                  <div className="flex-shrink-0">
                    {getFileIcon(file)}
                  </div>

                  {/* File Info & Fields */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 truncate">{file.file.name}</p>
                        <p className="text-xs text-gray-500">{(file.file.size / 1024).toFixed(1)} KB</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(file.tempId)}
                        disabled={isUploading || file.status === 'uploading'}
                        className="flex-shrink-0 rounded-md p-1 text-gray-400 hover:text-red-600 disabled:opacity-50"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Status */}
                    {file.status === 'uploading' && (
                      <div className="text-xs text-blue-600">Uploading...</div>
                    )}
                    {file.status === 'success' && (
                      <div className="text-xs text-green-600">✓ Uploaded</div>
                    )}
                    {file.status === 'error' && file.error && (
                      <div className="text-xs text-red-600">✗ {file.error}</div>
                    )}

                    {/* Editable Fields */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">Title *</label>
                        <input
                          type="text"
                          value={file.title}
                          onChange={(e) => handleFileFieldChange(file.tempId, 'title', e.target.value)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
                          disabled={isUploading || file.status === 'uploading'}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">Asset Type *</label>
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
                            handleFileFieldChange(file.tempId, 'assetTypeId', selectedTypeId);
                            handleFileFieldChange(file.tempId, 'assetType', selectedType ? slugToEnumMap[selectedType.slug] || 'other' : 'other');
                            handleFileFieldChange(file.tempId, 'assetSubtypeId', null);
                          }}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
                          disabled={isUploading || file.status === 'uploading'}
                        >
                          <option value="">Select Type</option>
                          {assetTypes.map(type => (
                            <option key={type.id} value={type.id}>{type.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">Sub-Type *</label>
                        <select
                          value={file.assetSubtypeId || ''}
                          onChange={(e) => handleFileFieldChange(file.tempId, 'assetSubtypeId', e.target.value || null)}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
                          disabled={isUploading || file.status === 'uploading' || !file.assetTypeId}
                        >
                          <option value="">Select Sub-Type</option>
                          {assetSubtypes
                            .filter(st => st.asset_type_id === file.assetTypeId)
                            .map(subtype => (
                              <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-0.5">Product</label>
                        <select
                          value={file.productName}
                          onChange={(e) => {
                            const selectedProduct = products.find(p => p.item_name === e.target.value);
                            handleFileFieldChange(file.tempId, 'productName', e.target.value);
                            handleFileFieldChange(file.tempId, 'sku', selectedProduct?.sku || '');
                          }}
                          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

