'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
    productLine: string;
    campaignId: string | null;
    selectedLocaleCodes: string[];
    primaryLocale: string | null;
    selectedTagSlugs: string[];
  };
  onGlobalDefaultsChange: (defaults: BulkUploadPanelProps['globalDefaults']) => void;
  locales: LocaleOption[];
  tags: Array<{ id: string; slug: string; label: string }> | Array<{ slug: string; label: string }>;
  assetTypes: Array<{ id: string; name: string; slug: string }>;
  assetSubtypes: Array<{ id: string; name: string; slug: string; asset_type_id: string }>;
  products: Array<{ id: number; item_name: string; sku: string }>;
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
  tags,
  assetTypes,
  assetSubtypes,
  products,
  campaigns,
  isUploading,
  accessToken,
  onTagsChange,
}: BulkUploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const lastDefaultsRef = useRef<string>('');

  // Create a stable key for global defaults to detect changes
  const globalDefaultsKey = useMemo(() => JSON.stringify({
    productLine: globalDefaults.productLine,
    campaignId: globalDefaults.campaignId,
    selectedLocaleCodes: [...globalDefaults.selectedLocaleCodes].sort(),
    primaryLocale: globalDefaults.primaryLocale,
    selectedTagSlugs: [...globalDefaults.selectedTagSlugs].sort(),
  }), [globalDefaults.productLine, globalDefaults.campaignId, globalDefaults.primaryLocale, globalDefaults.selectedLocaleCodes.join(','), globalDefaults.selectedTagSlugs.join(',')]);

  // Propagate global defaults to all files that don't have overrides
  useEffect(() => {
    if (files.length === 0) return;
    
    // Skip if defaults haven't changed
    if (lastDefaultsRef.current === globalDefaultsKey) return;
    lastDefaultsRef.current = globalDefaultsKey;
    
    const updatedFiles = files.map(file => {
      const overrides = file.overrides || {};
      const updates: Partial<BulkFile> = {};
      
      // Update productLine if not overridden
      if (!overrides.productLine && file.productLine !== globalDefaults.productLine) {
        updates.productLine = globalDefaults.productLine;
      }
      
      // Update campaignId if not overridden
      if (!overrides.campaignId && file.campaignId !== globalDefaults.campaignId) {
        updates.campaignId = globalDefaults.campaignId;
      }
      
      // Update locales if not overridden
      if (!overrides.locales) {
        const currentLocales = (file.selectedLocaleCodes || []).sort();
        const globalLocales = (globalDefaults.selectedLocaleCodes || []).sort();
        const localesMatch = currentLocales.length === globalLocales.length &&
          currentLocales.every((loc, idx) => loc === globalLocales[idx]);
        if (!localesMatch) {
          updates.selectedLocaleCodes = [...globalDefaults.selectedLocaleCodes];
          // Update primaryLocale if it's not in the new locales
          if (globalDefaults.selectedLocaleCodes.length > 0) {
            const newPrimary = globalDefaults.selectedLocaleCodes.includes(file.primaryLocale || '') 
              ? file.primaryLocale 
              : (globalDefaults.primaryLocale || globalDefaults.selectedLocaleCodes[0]);
            updates.primaryLocale = newPrimary;
          }
        }
      }
      
      // Update tags if not overridden
      if (!overrides.tags) {
        const currentTags = (file.selectedTagSlugs || []).sort();
        const globalTags = (globalDefaults.selectedTagSlugs || []).sort();
        const tagsMatch = currentTags.length === globalTags.length &&
          currentTags.every((tag, idx) => tag === globalTags[idx]);
        if (!tagsMatch) {
          updates.selectedTagSlugs = [...globalDefaults.selectedTagSlugs];
        }
      }
      
      return Object.keys(updates).length > 0 ? { ...file, ...updates } : file;
    });
    
    // Only update if there are actual changes
    const hasChanges = updatedFiles.some((updated, index) => {
      const original = files[index];
      return updated.productLine !== original.productLine ||
        updated.campaignId !== original.campaignId ||
        JSON.stringify(updated.selectedLocaleCodes?.sort()) !== JSON.stringify(original.selectedLocaleCodes?.sort()) ||
        updated.primaryLocale !== original.primaryLocale ||
        JSON.stringify(updated.selectedTagSlugs?.sort()) !== JSON.stringify(original.selectedTagSlugs?.sort());
    });
    
    if (hasChanges) {
      onFilesChange(updatedFiles);
    }
  }, [globalDefaultsKey]); // Use a stable key to prevent infinite loops

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
        useTitleAsFilename: false,
        campaignId: globalDefaults.campaignId,
        status: 'pending',
        previewUrl,
        overrides: {},
      };
    }));
    
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

  const getEffectiveValue = (file: BulkFile, field: 'productLine' | 'campaignId' | 'selectedLocaleCodes' | 'selectedTagSlugs') => {
    const overrides = file.overrides || {};
    if (field === 'productLine' && overrides.productLine) return file.productLine;
    if (field === 'campaignId' && overrides.campaignId) return file.campaignId;
    if (field === 'selectedLocaleCodes' && overrides.locales) return file.selectedLocaleCodes;
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
          tags={tags}
          campaigns={campaigns}
          isUploading={isUploading}
          accessToken={accessToken}
          onTagsChange={onTagsChange}
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
                  locales={locales}
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
