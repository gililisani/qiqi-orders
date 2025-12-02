'use client';

import { useState, useRef, useCallback } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { LocaleOption } from './types';
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
  useTitleAsFilename: boolean;
  campaignId: string | null;
  status?: 'pending' | 'uploading' | 'success' | 'error';
  error?: string;
  previewUrl?: string | null; // Thumbnail preview URL (object URL for images, data URL for PDFs)
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

interface BulkUploadPanelProps {
  files: BulkFile[];
  onFilesChange: (files: BulkFile[]) => void;
  onCancel: () => void;
  onUpload: () => Promise<void>;
  globalDefaults: {
    assetSubtypeId: string | null;
    productLine: string;
    selectedTagSlugs: string[];
    selectedLocaleCodes: string[];
    campaignId: string | null;
  };
  onGlobalDefaultsChange: (defaults: BulkUploadPanelProps['globalDefaults']) => void;
  locales: LocaleOption[];
  allLocales?: LocaleOption[]; // All locales including inactive (for showing current values)
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
  productLines: Array<{ code: string; name: string }>;
  campaigns: Array<{ id: string; name: string }>;
  isUploading: boolean;
  accessToken?: string | null;
  onTagsChange?: (tags: Array<{ id: string; slug: string; label: string }>) => void;
}

export default function BulkUploadPanel({
  files,
  onFilesChange,
  onCancel,
  onUpload,
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
  isUploading,
  accessToken,
  onTagsChange,
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

  // Generate PDF thumbnail preview (returns data URL)
  const generatePDFPreview = async (file: File): Promise<string | null> => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    try {
      const pdfjsLib = await import('pdfjs-dist');
      const pdfjsVersion = pdfjsLib.version || '5.4.394';
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useSystemFonts: true,
      }).promise;

      if (pdf.numPages === 0) {
        return null;
      }

      const page = await pdf.getPage(1);
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        return null;
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvas: canvas,
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // Return data URL for preview
      return canvas.toDataURL('image/png', 0.85);
    } catch (err) {
      console.error('Failed to generate PDF preview:', err);
      return null;
    }
  };

  const handleFileSelect = useCallback(async (selectedFiles: File[]) => {
    const defaultLocale = locales.find(loc => loc.is_default) || locales[0];
    
    const newFiles: BulkFile[] = await Promise.all(selectedFiles.map(async (file) => {
      const inferred = inferAssetType(file.name, file.type);
      const baseTitle = file.name.replace(/\.[^/.]+$/, '');
      
      // Generate preview URL
      let previewUrl: string | null = null;
      
      // For images, use object URL
      if (file.type.startsWith('image/')) {
        previewUrl = URL.createObjectURL(file);
      }
      // For PDFs, generate thumbnail
      else if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
        previewUrl = await generatePDFPreview(file);
      }
      
      // Use global defaults ONLY at file creation time
      // Type is always auto-detected (inferred), Sub-type uses global default if set AND types match
      const initialAssetTypeId = inferred.typeId; // Always use inferred type
      // Only apply global subtype if the file's type matches the subtype's parent type
      let initialAssetSubtypeId = null;
      if (globalDefaults.assetSubtypeId) {
        const globalSubtype = assetSubtypes.find(st => st.id === globalDefaults.assetSubtypeId);
        if (globalSubtype && initialAssetTypeId === globalSubtype.asset_type_id) {
          initialAssetSubtypeId = globalDefaults.assetSubtypeId;
        }
      }
      const selectedAssetType = assetTypes.find(t => t.id === initialAssetTypeId);
      const slugToEnumMap: Record<string, string> = {
        'image': 'image',
        'video': 'video',
        'document': 'document',
        'artwork': 'document',
        'audio': 'audio',
        'packaging-regulatory': 'document',
        'campaign': 'document',
      };
      const initialAssetTypeEnum = selectedAssetType 
        ? slugToEnumMap[selectedAssetType.slug] || inferred.type
        : inferred.type;
      
      return {
        tempId: `bulk-${Date.now()}-${Math.random()}`,
        file,
        inferredAssetType: inferred.type,
        inferredAssetTypeId: inferred.typeId,
        title: baseTitle,
        description: '',
        assetType: initialAssetTypeEnum,
        assetTypeId: initialAssetTypeId,
        assetSubtypeId: initialAssetSubtypeId,
        productLine: globalDefaults.productLine, // Use global default at creation
        productName: '',
        sku: '',
        selectedTagSlugs: globalDefaults.selectedTagSlugs || [], // Use global default
        selectedLocaleCodes: globalDefaults.selectedLocaleCodes.length > 0 
          ? globalDefaults.selectedLocaleCodes 
          : (defaultLocale ? [defaultLocale.code] : []), // Use global default or fallback to default locale
        primaryLocale: globalDefaults.selectedLocaleCodes.length > 0 
          ? globalDefaults.selectedLocaleCodes[0] 
          : (defaultLocale ? defaultLocale.code : null),
        useTitleAsFilename: false,
        campaignId: globalDefaults.campaignId, // Use global default at creation
        status: 'pending',
        previewUrl,
        overrides: {}, // No overrides initially
      };
    }));
    
    onFilesChange([...files, ...newFiles]);
  }, [files, globalDefaults, locales, onFilesChange, assetTypes, assetSubtypes]);

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

  const handleFileFieldsChange = (tempId: string, updates: Partial<BulkFile>) => {
    onFilesChange(files.map(f => 
      f.tempId === tempId ? { ...f, ...updates } : f
    ));
  };

  const handleRemoveFile = (tempId: string) => {
    // Clean up object URLs before removing
    const fileToRemove = files.find(f => f.tempId === tempId);
    if (fileToRemove?.previewUrl && fileToRemove.file.type.startsWith('image/')) {
      URL.revokeObjectURL(fileToRemove.previewUrl);
    }
    onFilesChange(files.filter(f => f.tempId !== tempId));
  };

  const getEffectiveValue = (file: BulkFile, field: 'assetSubtypeId' | 'productLine' | 'selectedTagSlugs' | 'selectedLocaleCodes' | 'campaignId') => {
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

  const canUpload = files.length > 0 && files.every(f => {
    const effectiveLocales = f.selectedLocaleCodes || [];
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
          assetTypes={assetTypes}
          assetSubtypes={assetSubtypes}
          campaigns={campaigns}
          productLines={productLines}
          tags={tags}
          locales={locales}
          isUploading={isUploading}
        />
      )}

      {/* File Selector / Drop Zone */}
      <div className="px-4 py-3 border-b border-gray-200">
        <label className="block text-xs font-medium text-gray-700 mb-2">Select Files</label>
        <div className="flex items-center">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
            disabled={isUploading}
            id="bulk-upload-file-input"
          />
          <label
            htmlFor="bulk-upload-file-input"
            className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-xs font-medium text-white hover:opacity-90 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <ArrowUpTrayIcon className="h-4 w-4" />
            Choose Files
          </label>
        </div>
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
          <div className="mt-4 rounded-lg border border-gray-300 bg-[#fafafa] p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {files.map((file) => (
                <BulkUploadCard
                  key={file.tempId}
                  file={file}
                  onFieldChange={handleFileFieldChange}
                  onFieldsChange={handleFileFieldsChange}
                  onRemove={handleRemoveFile}
                  assetTypes={assetTypes}
                  assetSubtypes={assetSubtypes}
                  products={products}
                  productLines={productLines}
                  locales={locales}
                  allLocales={allLocales}
                  tags={tags}
                  campaigns={campaigns}
                  globalDefaults={globalDefaults}
                  getEffectiveValue={getEffectiveValue}
                  isUploading={isUploading}
                  accessToken={accessToken}
                  onTagsChange={onTagsChange}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
