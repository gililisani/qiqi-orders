'use client';

import { useState, useRef } from 'react';
import { XMarkIcon, TrashIcon, PhotoIcon, DocumentTextIcon, FilmIcon, MusicalNoteIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
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
  // Track which fields have been overridden
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
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

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
        overrides: {},
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
    setExpandedFiles(prev => {
      const next = new Set(prev);
      next.delete(tempId);
      return next;
    });
  };

  const handleFileFieldChange = (tempId: string, field: keyof BulkFile, value: any) => {
    onFilesChange(files.map(f => 
      f.tempId === tempId ? { ...f, [field]: value } : f
    ));
  };

  const handlePerFileOverride = (tempId: string, field: 'productLine' | 'locales' | 'regions' | 'tags' | 'campaignId' | 'sku', value: any) => {
    onFilesChange(files.map(f => {
      if (f.tempId === tempId) {
        const overrides = { ...(f.overrides || {}), [field]: true };
        return { ...f, [field]: value, overrides };
      }
      return f;
    }));
  };

  const handleGlobalDefaultChange = (field: keyof typeof globalDefaults, value: any) => {
    const newDefaults = { ...globalDefaults, [field]: value };
    onGlobalDefaultsChange(newDefaults);
    
    // Apply to all files that haven't been manually overridden
    onFilesChange(files.map(f => {
      const overrides = f.overrides || {};
      if (field === 'productLine' && !overrides.productLine) {
        return { ...f, productLine: value };
      }
      if (field === 'selectedLocaleCodes' && !overrides.locales) {
        return { ...f, selectedLocaleCodes: [...value], primaryLocale: value[0] || f.primaryLocale };
      }
      if (field === 'selectedRegionCodes' && !overrides.regions) {
        return { ...f, selectedRegionCodes: [...value] };
      }
      if (field === 'selectedTagSlugs' && !overrides.tags) {
        return { ...f, selectedTagSlugs: [...value] };
      }
      if (field === 'campaignId' && !overrides.campaignId) {
        return { ...f, campaignId: value };
      }
      return f;
    }));
  };

  const getFileIcon = (file: BulkFile) => {
    if (file.assetType === 'image') return <PhotoIcon className="h-8 w-8 text-blue-500" />;
    if (file.assetType === 'document' || file.assetType === 'artwork') return <DocumentTextIcon className="h-8 w-8 text-green-500" />;
    if (file.assetType === 'video') return <FilmIcon className="h-8 w-8 text-purple-500" />;
    if (file.assetType === 'audio') return <MusicalNoteIcon className="h-8 w-8 text-pink-500" />;
    return <DocumentTextIcon className="h-8 w-8 text-gray-500" />;
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

  const toggleExpanded = (tempId: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev);
      if (next.has(tempId)) {
        next.delete(tempId);
      } else {
        next.add(tempId);
      }
      return next;
    });
  };

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

        {/* Global Defaults - Compact Card */}
        {files.length > 0 && (
          <div className="mb-4 rounded-md border border-gray-200 bg-gray-50 p-3">
            <h4 className="text-xs font-semibold text-gray-900 mb-2">Global Defaults</h4>
            <p className="text-xs text-gray-500 mb-3">These defaults apply to all files unless overridden.</p>
            
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">Campaign</label>
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
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[50px]"
                  disabled={isUploading}
                >
                  {locales.map(loc => (
                    <option key={loc.code} value={loc.code}>{loc.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Regions</label>
                <select
                  multiple
                  value={globalDefaults.selectedRegionCodes}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    handleGlobalDefaultChange('selectedRegionCodes', selected);
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[50px]"
                  disabled={isUploading}
                >
                  {regions.map(reg => (
                    <option key={reg.code} value={reg.code}>{reg.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tags</label>
                <select
                  multiple
                  value={globalDefaults.selectedTagSlugs}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                    handleGlobalDefaultChange('selectedTagSlugs', selected);
                  }}
                  className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[50px]"
                  disabled={isUploading}
                >
                  {tags.map(tag => (
                    <option key={tag.slug} value={tag.slug}>{tag.label}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
              </div>
            </div>
          </div>
        )}

        {/* Per-File Cards - Grid Layout */}
        {files.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-gray-900 mb-3">Files ({files.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {files.map((file) => {
                const isExpanded = expandedFiles.has(file.tempId);
                const effectiveProductLine = getEffectiveValue(file, 'productLine');
                const effectiveCampaignId = getEffectiveValue(file, 'campaignId');
                const effectiveLocales = getEffectiveValue(file, 'selectedLocaleCodes');
                const effectiveRegions = getEffectiveValue(file, 'selectedRegionCodes');
                const effectiveTags = getEffectiveValue(file, 'selectedTagSlugs');
                const overrides = file.overrides || {};

                return (
                  <div key={file.tempId} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    {/* File Header */}
                    <div className="flex items-start gap-2 mb-3">
                      <div className="flex-shrink-0">
                        {getFileIcon(file)}
                      </div>
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
                      <div className="text-xs text-blue-600 mb-2">Uploading...</div>
                    )}
                    {file.status === 'success' && (
                      <div className="text-xs text-green-600 mb-2">✓ Uploaded</div>
                    )}
                    {file.status === 'error' && file.error && (
                      <div className="text-xs text-red-600 mb-2">✗ {file.error}</div>
                    )}

                    {/* Main Fields */}
                    <div className="space-y-2 mb-3">
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

                      <div className="grid grid-cols-2 gap-2">
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

                    {/* Global Defaults Applied - Read-only chips */}
                    <div className="mb-3 pt-2 border-t border-gray-100">
                      <p className="text-xs text-gray-500 mb-1.5">Applied defaults:</p>
                      <div className="flex flex-wrap gap-1">
                        {effectiveProductLine && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {effectiveProductLine}
                          </span>
                        )}
                        {effectiveCampaignId && campaigns.find(c => c.id === effectiveCampaignId) && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {campaigns.find(c => c.id === effectiveCampaignId)?.name}
                          </span>
                        )}
                        {effectiveLocales.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {effectiveLocales.length} locale{effectiveLocales.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {effectiveRegions.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {effectiveRegions.length} region{effectiveRegions.length !== 1 ? 's' : ''}
                          </span>
                        )}
                        {effectiveTags.length > 0 && (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                            {effectiveTags.length} tag{effectiveTags.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* More Details Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleExpanded(file.tempId)}
                      className="w-full flex items-center justify-between text-xs text-gray-600 hover:text-gray-900 py-1"
                      disabled={isUploading || file.status === 'uploading'}
                    >
                      <span>More details</span>
                      {isExpanded ? (
                        <ChevronUpIcon className="h-4 w-4" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4" />
                      )}
                    </button>

                    {/* Expanded Override Fields */}
                    {isExpanded && (
                      <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">SKU</label>
                          <input
                            type="text"
                            value={file.sku}
                            onChange={(e) => handleFileFieldChange(file.tempId, 'sku', e.target.value)}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none h-7"
                            disabled={isUploading || file.status === 'uploading'}
                            placeholder="Auto-filled from product"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">Tags (override)</label>
                          <select
                            multiple
                            value={file.selectedTagSlugs}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                              handlePerFileOverride(file.tempId, 'tags', selected);
                            }}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[50px]"
                            disabled={isUploading || file.status === 'uploading'}
                          >
                            {tags.map(tag => (
                              <option key={tag.slug} value={tag.slug}>{tag.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">Locales (override)</label>
                          <select
                            multiple
                            value={file.selectedLocaleCodes}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                              handlePerFileOverride(file.tempId, 'locales', selected);
                              if (selected.length > 0 && !selected.includes(file.primaryLocale || '')) {
                                handleFileFieldChange(file.tempId, 'primaryLocale', selected[0]);
                              }
                            }}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[50px]"
                            disabled={isUploading || file.status === 'uploading'}
                          >
                            {locales.map(loc => (
                              <option key={loc.code} value={loc.code}>{loc.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-0.5">Regions (override)</label>
                          <select
                            multiple
                            value={file.selectedRegionCodes}
                            onChange={(e) => {
                              const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                              handlePerFileOverride(file.tempId, 'regions', selected);
                            }}
                            className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-black focus:outline-none min-h-[50px]"
                            disabled={isUploading || file.status === 'uploading'}
                          >
                            {regions.map(reg => (
                              <option key={reg.code} value={reg.code}>{reg.label}</option>
                            ))}
                          </select>
                          <p className="text-xs text-gray-400 mt-0.5">Ctrl/Cmd+click</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
