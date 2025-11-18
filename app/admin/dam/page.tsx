'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useSupabase } from '../../../lib/supabase-provider';
import Card from '../../components/ui/Card';
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  DocumentTextIcon,
  FilmIcon,
  MusicalNoteIcon,
  PhotoIcon,
  Squares2X2Icon,
  TrashIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  CheckIcon,
  EyeIcon,
  PencilIcon,
  MagnifyingGlassIcon,
} from '@heroicons/react/24/outline';

const assetTypeOptions: Array<{ value: string; label: string; icon: JSX.Element }> = [
  { value: 'image', label: 'Image', icon: <PhotoIcon className="h-4 w-4" /> },
  { value: 'video', label: 'Video', icon: <FilmIcon className="h-4 w-4" /> },
  { value: 'document', label: 'Document', icon: <DocumentTextIcon className="h-4 w-4" /> },
  { value: 'audio', label: 'Audio', icon: <MusicalNoteIcon className="h-4 w-4" /> },
  { value: 'font', label: 'Font', icon: <DocumentTextIcon className="h-4 w-4" /> },
  { value: 'archive', label: 'Archive', icon: <Squares2X2Icon className="h-4 w-4" /> },
  { value: 'other', label: 'Other', icon: <Squares2X2Icon className="h-4 w-4" /> },
];

interface TagOption {
  id: string;
  slug: string;
  label: string;
}

interface LocaleOption {
  code: string;
  label: string;
  is_default?: boolean;
}

interface RegionOption {
  code: string;
  label: string;
}

interface AssetVersion {
  id: string;
  version_number: number;
  storage_path: string;
  thumbnail_path?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  processing_status: string;
  created_at: string;
  duration_seconds?: number | null;
  width?: number | null;
  height?: number | null;
  downloadPath?: string | null;
  previewPath?: string | null;
}

type VimeoDownloadFormat = {
  resolution: string;
  url: string;
};

interface AssetRecord {
  id: string;
  title: string;
  description?: string | null;
  asset_type: string; // Legacy enum field
  asset_type_id?: string | null; // New taxonomy Asset Type ID
  asset_subtype_id?: string | null; // New taxonomy Asset Sub-Type ID
  product_line?: string | null;
  product_name?: string | null; // New Product Name field
  sku?: string | null;
  vimeo_video_id?: string | null;
  vimeo_download_1080p?: string | null; // Legacy - kept for backwards compatibility
  vimeo_download_720p?: string | null; // Legacy
  vimeo_download_480p?: string | null; // Legacy
  vimeo_download_360p?: string | null; // Legacy
  vimeo_download_formats?: VimeoDownloadFormat[] | null; // New dynamic format
  created_at: string;
  current_version?: AssetVersion | null;
  tags: string[];
  locales: LocaleOption[];
  regions: RegionOption[];
}

interface UploadFormState {
  title: string;
  description: string;
  assetType: string; // Legacy enum field (image, video, document, etc.)
  assetTypeId: string | null; // New taxonomy Asset Type ID
  assetSubtypeId: string | null; // New taxonomy Asset Sub-Type ID
  productLine: string; // ProCtrl, SelfCtrl, Both, None
  productName: string; // Hair Controller, Curl Controller, etc.
  sku: string;
  selectedTagSlugs: string[];
  selectedLocaleCodes: string[];
  primaryLocale: string | null;
  selectedRegionCodes: string[];
  file: File | null;
  vimeoVideoId: string; // Vimeo video ID or URL (main video for preview)
  vimeoDownloadFormats: VimeoDownloadFormat[]; // Dynamic download formats
}

const defaultFormState: UploadFormState = {
  title: '',
  description: '',
  assetType: 'image',
  assetTypeId: null,
  assetSubtypeId: null,
  productLine: '',
  productName: '',
  sku: '',
  selectedTagSlugs: [],
  selectedLocaleCodes: [],
  primaryLocale: null,
  selectedRegionCodes: [],
  file: null,
  vimeoVideoId: '',
  vimeoDownloadFormats: [],
};

// Product name options (static list)
const PRODUCT_NAME_OPTIONS = [
  'Hair Controller',
  'Curl Controller',
  'Volume Controller',
  'Texture Controller',
  'Other',
];

// Resolution options for video downloads
const RESOLUTION_OPTIONS = [
  '4K',
  '2K',
  '1080p',
  '720p',
  '480p',
  '360p',
  '240p',
  'Other',
];

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 10 || value < 1 ? 0 : 1)} ${units[exponent]}`;
}

function buildAuthHeaders(accessToken: string | undefined | null): Record<string, string> {
  if (!accessToken) return {};
  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

// Parse Vimeo video ID from various URL formats
function parseVimeoId(input: string): string | null {
  if (!input || !input.trim()) return null;
  
  const trimmed = input.trim();
  
  // Check if it's already just a numeric ID
  if (/^\d+$/.test(trimmed)) {
    return trimmed;
  }
  
  // Try to extract from various Vimeo URL patterns
  const patterns = [
    /(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/i,
    /vimeo\.com\/(\d+)/i,
    /player\.vimeo\.com\/video\/(\d+)/i,
  ];
  
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

// Check if a string is a direct MP4/URL (starts with http:// or https://)
function isDirectUrl(input: string): boolean {
  return /^https?:\/\//i.test(input.trim());
}

// Log download event
async function logDownload(
  assetId: string,
  downloadUrl: string,
  downloadMethod: string,
  accessToken: string | null
): Promise<void> {
  if (!accessToken) return;
  
  try {
    const headers = buildAuthHeaders(accessToken);
    await fetch('/api/dam/downloads/log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        assetId,
        downloadUrl,
        downloadMethod,
      }),
    });
  } catch (err) {
    console.error('Failed to log download:', err);
    // Don't block download if logging fails
  }
}

async function triggerDownload(
  url: string,
  filename: string,
  assetId: string,
  downloadMethod: string,
  accessToken: string | null
): Promise<void> {
  try {
    // Log the download first
    await logDownload(assetId, url, downloadMethod, accessToken);
    
    // Try to fetch and download as blob (works for direct file URLs)
    try {
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
      });
      
      if (response.ok) {
        const blob = await response.blob();
        const blobUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        return;
      }
    } catch (fetchError) {
      // If fetch fails (CORS issue), fall back to direct link
    }
    
    // Fallback: create temporary anchor and click it
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'download';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Download failed:', err);
    // Last resort: open in new tab
    window.open(url, '_blank');
  }
}

export default function AdminDigitalAssetManagerPage() {
  const { session, supabase } = useSupabase();
  const [accessToken, setAccessToken] = useState<string | null>(session?.access_token ?? null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [error, setError] = useState<string>('');

  const [tags, setTags] = useState<TagOption[]>([]);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [assetTypes, setAssetTypes] = useState<Array<{ id: string; name: string; slug: string }>>([]);
  const [assetSubtypes, setAssetSubtypes] = useState<Array<{ id: string; name: string; slug: string; asset_type_id: string }>>([]);

  const [formState, setFormState] = useState<UploadFormState>(defaultFormState);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [newTagLabel, setNewTagLabel] = useState('');
  
  // Upload progress tracking
  interface ActiveUpload {
    id: string;
    fileName: string;
    fileSize: number;
    progress: number;
    status: 'pending' | 'uploading' | 'completing' | 'success' | 'error';
    error?: string;
    assetId?: string;
    storagePath?: string;
    startTime: number;
  }
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>(''); // Legacy enum filter
  const [assetTypeFilter, setAssetTypeFilter] = useState<string>(''); // New taxonomy Asset Type filter
  const [assetSubtypeFilter, setAssetSubtypeFilter] = useState<string>(''); // New taxonomy Asset Sub-Type filter
  const [localeFilter, setLocaleFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('');
  const [tagFilter, setTagFilter] = useState<string>('');
  const [productLineFilter, setProductLineFilter] = useState<string>('');
  const [productNameFilter, setProductNameFilter] = useState<string>(''); // New Product Name filter
  const [dateFromFilter, setDateFromFilter] = useState<string>('');
  const [dateToFilter, setDateToFilter] = useState<string>('');
  const [fileSizeMinFilter, setFileSizeMinFilter] = useState<string>('');
  const [fileSizeMaxFilter, setFileSizeMaxFilter] = useState<string>('');
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pagination, setPagination] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  } | null>(null);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [productLines, setProductLines] = useState<string[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null);
  const [isEditingAsset, setIsEditingAsset] = useState(false);
  const [assetVersions, setAssetVersions] = useState<Array<{
    id: string;
    version_number: number;
    storage_path: string;
    thumbnail_path?: string | null;
    mime_type?: string | null;
    file_size?: number | null;
    created_at: string;
    downloadPath: string;
    previewPath: string;
  }>>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [editingDownloadUrls, setEditingDownloadUrls] = useState<VimeoDownloadFormat[]>([]);
  const [savingUrls, setSavingUrls] = useState(false);
  const [isUploadDrawerOpen, setIsUploadDrawerOpen] = useState(false);
  const [hoveredAssetId, setHoveredAssetId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'compact' | 'comfortable'>('compact');
  const [showRegions, setShowRegions] = useState(false);
  const [showVideoDownloadFormats, setShowVideoDownloadFormats] = useState(false);

  useEffect(() => {
    let active = true;
    if (!accessToken) {
      supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
        if (!active) return;
        setAccessToken(data.session?.access_token ?? null);
      });
    }
    return () => {
      active = false;
    };
  }, [accessToken, supabase]);

  useEffect(() => {
    if (!accessToken) return;
    fetchLookups(accessToken);
    fetchAssets(accessToken);
    
    // Restore active uploads from localStorage
    const storedUploads = localStorage.getItem('dam_active_uploads');
    if (storedUploads) {
      try {
        const uploads = JSON.parse(storedUploads) as ActiveUpload[];
        // Filter out completed/old uploads (older than 1 hour)
        const validUploads = uploads.filter(
          (u) => u.status !== 'success' && u.status !== 'error' && Date.now() - u.startTime < 3600000
        );
        if (validUploads.length > 0) {
          setActiveUploads(validUploads);
          // Note: We don't automatically resume uploads on load - user needs to refresh or retry
        } else {
          localStorage.removeItem('dam_active_uploads');
        }
      } catch (e) {
        console.error('Failed to restore uploads from localStorage', e);
      }
    }
  }, [accessToken]);

  // Save active uploads to localStorage whenever they change
  useEffect(() => {
    if (activeUploads.length > 0) {
      localStorage.setItem('dam_active_uploads', JSON.stringify(activeUploads));
    } else {
      localStorage.removeItem('dam_active_uploads');
    }
  }, [activeUploads]);

  useEffect(() => {
    const setBreadcrumbs = () => {
      if ((window as any).__setBreadcrumbs) {
        try {
          (window as any).__setBreadcrumbs([
            { label: 'Products' },
            { label: 'Digital Asset Manager' },
          ]);
        } catch (err) {
          console.error('Error setting breadcrumbs:', err);
        }
      }
    };

    setBreadcrumbs();
    return () => {
      if ((window as any).__setBreadcrumbs) {
        (window as any).__setBreadcrumbs([]);
      }
    };
  }, []);

  const fetchLookups = async (token: string) => {
    try {
      const headers = buildAuthHeaders(token);
      const response = await fetch('/api/dam/lookups', {
        method: 'GET',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load lookup data');
      }

      const payload = await response.json();
      const localeOptions: LocaleOption[] = payload.locales || [];
      setTags(payload.tags || []);
      setLocales(localeOptions);
      setRegions(payload.regions || []);
      setAssetTypes(payload.assetTypes || []);
      setAssetSubtypes(payload.assetSubtypes || []);

      const defaultLocale = localeOptions.find((loc) => loc.is_default) ?? localeOptions[0];
      if (defaultLocale) {
        setFormState((prev) => ({
          ...prev,
          selectedLocaleCodes: [defaultLocale.code],
          primaryLocale: defaultLocale.code,
        }));
      }
    } catch (err: any) {
      console.error('Failed to load lookup data', err);
      setError(err.message || 'Failed to load lookup data');
    }
  };

  const fetchAssets = async (token: string, search?: string, page: number = 1) => {
    try {
      setLoadingAssets(true);
      setError('');

      const headers = buildAuthHeaders(token);
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      if (dateFromFilter) params.set('dateFrom', dateFromFilter);
      if (dateToFilter) params.set('dateTo', dateToFilter);
      if (fileSizeMinFilter) {
        // Convert MB to bytes
        const bytes = parseFloat(fileSizeMinFilter) * 1024 * 1024;
        params.set('fileSizeMin', Math.floor(bytes).toString());
      }
      if (fileSizeMaxFilter) {
        // Convert MB to bytes
        const bytes = parseFloat(fileSizeMaxFilter) * 1024 * 1024;
        params.set('fileSizeMax', Math.floor(bytes).toString());
      }
      params.set('page', page.toString());
      params.set('limit', '50');
      
      const url = `/api/dam/assets?${params.toString()}`;
      const response = await fetch(url, {
        method: 'GET',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load assets');
      }

      const payload = await response.json() as { assets?: AssetRecord[]; pagination?: any };
      setAssets(payload.assets || []);
      setPagination(payload.pagination || null);
      setCurrentPage(page);
      
      // Extract unique product lines
      const uniqueProductLines = [...new Set((payload.assets || []).map((a) => a.product_line).filter((pl: string | null | undefined): pl is string => Boolean(pl) && typeof pl === 'string'))];
      setProductLines(uniqueProductLines);
    } catch (err: any) {
      console.error('Failed to load assets', err);
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    if (!window.confirm('Are you sure you want to delete this asset? This will delete all versions and files. This action cannot be undone.')) {
      return;
    }

    if (!accessToken) {
      setError('Not authenticated. Please refresh the page.');
      return;
    }

    try {
      setError('');
      const headers = buildAuthHeaders(accessToken);
      const response = await fetch(`/api/dam/assets/${assetId}`, {
        method: 'DELETE',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete asset');
      }

      // Refresh assets list
      await fetchAssets(accessToken, undefined, currentPage);
      setSelectedAssetIds(new Set());
      setSuccessMessage('Asset deleted successfully.');
    } catch (err: any) {
      console.error('Failed to delete asset', err);
      setError(err.message || 'Failed to delete asset');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedAssetIds.size === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedAssetIds.size} asset(s)? This will delete all versions and files. This action cannot be undone.`)) {
      return;
    }

    if (!accessToken) {
      setError('Not authenticated. Please refresh the page.');
      return;
    }

    try {
      setBulkDeleting(true);
      setError('');
      const headers = buildAuthHeaders(accessToken);
      
      // Delete assets one by one
      const deletePromises = Array.from(selectedAssetIds).map(assetId =>
        fetch(`/api/dam/assets/${assetId}`, {
          method: 'DELETE',
          headers: Object.keys(headers).length ? headers : undefined,
          credentials: 'same-origin',
        }).then(res => {
          if (!res.ok) {
            const data = res.json().catch(() => ({}));
            throw new Error(`Failed to delete asset ${assetId}`);
          }
          return res;
        })
      );

      await Promise.all(deletePromises);
      
      // Refresh assets list
      await fetchAssets(accessToken, undefined, currentPage);
      setSelectedAssetIds(new Set());
      setSuccessMessage(`${selectedAssetIds.size} asset(s) deleted successfully.`);
    } catch (err: any) {
      console.error('Failed to delete assets', err);
      setError(err.message || 'Failed to delete assets');
    } finally {
      setBulkDeleting(false);
    }
  };

  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedAssetIds.size === filteredAssets.length) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(filteredAssets.map(a => a.id)));
    }
  };

  // Fetch assets when search term or filters change (debounced)
  useEffect(() => {
    if (!accessToken) return;
    const timeoutId = setTimeout(() => {
      fetchAssets(accessToken, searchTerm || undefined, 1);
      setCurrentPage(1);
    }, 300); // Debounce search by 300ms
    return () => clearTimeout(timeoutId);
  }, [searchTerm, dateFromFilter, dateToFilter, fileSizeMinFilter, fileSizeMaxFilter, accessToken]);

  // Auto-refresh removed - no background processing

  const filteredAssets = useMemo(() => {
    // Assets are already filtered by search on the server
    // Apply client-side filters for type, locale, region, tag, product line, and new taxonomy fields
    return assets.filter((asset) => {
      const matchesType = typeFilter ? asset.asset_type === typeFilter : true;
      const matchesAssetType = assetTypeFilter ? asset.asset_type_id === assetTypeFilter : true;
      const matchesAssetSubtype = assetSubtypeFilter ? asset.asset_subtype_id === assetSubtypeFilter : true;
      const matchesLocale = localeFilter
        ? asset.locales.some((locale) => locale.code === localeFilter)
        : true;
      const matchesRegion = regionFilter
        ? asset.regions.some((region) => region.code === regionFilter)
        : true;
      const matchesTag = tagFilter
        ? asset.tags.some((tag) => tag.toLowerCase().includes(tagFilter.toLowerCase()))
        : true;
      const matchesProductLine = productLineFilter
        ? asset.product_line?.toLowerCase().includes(productLineFilter.toLowerCase())
        : true;
      const matchesProductName = productNameFilter
        ? asset.product_name?.toLowerCase().includes(productNameFilter.toLowerCase())
        : true;
      return matchesType && matchesAssetType && matchesAssetSubtype && matchesLocale && matchesRegion && matchesTag && matchesProductLine && matchesProductName;
    });
  }, [assets, typeFilter, assetTypeFilter, assetSubtypeFilter, localeFilter, regionFilter, tagFilter, productLineFilter, productNameFilter]);

  const toggleSelection = (list: string[], value: string): string[] => {
    if (list.includes(value)) {
      return list.filter((item) => item !== value);
    }
    return [...list, value];
  };

  const handleLocaleToggle = (code: string) => {
    setFormState((prev) => {
      const isSelected = prev.selectedLocaleCodes.includes(code);
      if (isSelected) {
        if (prev.selectedLocaleCodes.length === 1) {
          return prev; // keep at least one locale
        }
        const nextLocales = prev.selectedLocaleCodes.filter((item) => item !== code);
        const nextPrimary = prev.primaryLocale === code ? nextLocales[0] ?? null : prev.primaryLocale;
        return {
          ...prev,
          selectedLocaleCodes: nextLocales,
          primaryLocale: nextPrimary,
        };
      }

      return {
        ...prev,
        selectedLocaleCodes: [...prev.selectedLocaleCodes, code],
        primaryLocale: prev.primaryLocale ?? code,
      };
    });
  };

  const handlePrimaryLocaleChange = (code: string) => {
    setFormState((prev) => ({ ...prev, primaryLocale: code }));
  };

  const handleAddTag = async () => {
    const trimmed = newTagLabel.trim();
    if (!trimmed) return;

    try {
      if (!accessToken) return;
      const headers = buildAuthHeaders(accessToken);
      const response = await fetch('/api/dam/lookups', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(Object.keys(headers).length ? headers : {}),
        },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'add-tag', label: trimmed }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add tag');
      }

      const payload = await response.json();
      setTags(payload.tags || []);
      setFormState((prev) => ({
        ...prev,
        selectedTagSlugs: [...new Set([...prev.selectedTagSlugs, payload.slug])],
      }));
      setNewTagLabel('');
    } catch (err: any) {
      setError(err.message || 'Failed to add tag');
    }
  };

  const resetForm = () => {
    const defaultLocale = locales.find((loc) => loc.is_default) ?? locales[0];
    setFormState({
      ...defaultFormState,
      selectedLocaleCodes: defaultLocale ? [defaultLocale.code] : [],
      primaryLocale: defaultLocale ? defaultLocale.code : null,
      vimeoDownloadFormats: [],
    });
    setSuccessMessage('');
    setIsUploadDrawerOpen(false); // Close drawer after successful upload
  };

  // Generate PDF thumbnail client-side
  const generatePDFThumbnail = async (file: File): Promise<{ thumbnailData: string; thumbnailPath: string } | null> => {
    if (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf')) {
      return null;
    }

    try {
      // Dynamically import pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');
      
      // Set worker source - use unpkg CDN which is more reliable
      // Use the actual installed version (5.4.394) or fallback
      const pdfjsVersion = pdfjsLib.version || '5.4.394';
      // For v5.x, the worker path is different
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      
      const pdf = await pdfjsLib.getDocument({ 
        data: arrayBuffer,
        useSystemFonts: true,
      }).promise;
      
      if (pdf.numPages === 0) {
        return null;
      }
      
      const page = await pdf.getPage(1); // Get first page

      // Render to canvas with a reasonable scale for thumbnails
      const scale = 1.5; // Lower scale for smaller file size
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        console.error('Failed to get canvas context');
        return null;
      }

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      // Render the page - pdfjs-dist v5 requires canvas parameter
      await page.render({
        canvas: canvas,
        canvasContext: context,
        viewport: viewport,
      }).promise;

      // Convert canvas to base64 PNG
      const dataUrl = canvas.toDataURL('image/png', 0.85); // 85% quality for smaller file size
      const thumbnailData = dataUrl.split(',')[1]; // Remove data:image/png;base64, prefix
      
      if (!thumbnailData || thumbnailData.length === 0) {
        console.error('Failed to generate thumbnail data');
        return null;
      }
      
      // Generate thumbnail path (will be stored in asset_renditions)
      const timestamp = Date.now();
      const thumbnailPath = `temp-thumb-${timestamp}.png`; // Will be updated with proper path during upload

      return { thumbnailData, thumbnailPath };
    } catch (err) {
      console.error('Failed to generate PDF thumbnail:', err);
      return null; // Don't fail upload if thumbnail generation fails
    }
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    // Validate video assets (check both legacy enum and new taxonomy)
    const selectedAssetType = assetTypes.find(t => t.id === formState.assetTypeId);
    const isVideoType = selectedAssetType?.slug === 'video' || formState.assetType === 'video';
    
    if (isVideoType) {
      if (!formState.vimeoVideoId.trim()) {
        setError('Please provide a Vimeo video ID or URL for video assets.');
        return;
      }
      if (formState.file) {
        setError('Videos must be uploaded to Vimeo. Please paste the Vimeo video ID or URL instead of uploading a file.');
        return;
      }
    } else {
      // Require file for non-video assets
      if (!formState.file) {
        setError('Please select a file to upload.');
        return;
      }
    }

    if (!formState.title.trim()) {
      setError('Title is required.');
      return;
    }

    if (formState.selectedLocaleCodes.length === 0) {
      setError('Please choose at least one locale.');
      return;
    }

    if (!formState.primaryLocale || !formState.selectedLocaleCodes.includes(formState.primaryLocale)) {
      setError('A primary locale must be selected.');
      return;
    }

    // Validate taxonomy: require asset type and subtype for new assets
    if (!formState.assetTypeId) {
      setError('Please select an Asset Type.');
      return;
    }
    if (!formState.assetSubtypeId) {
      setError('Please select an Asset Sub-Type.');
      return;
    }

    setUploading(true);
    try {
      if (!accessToken) {
        setError('Not authenticated');
        return;
      }

      // Handle video assets (Vimeo)
      if (isVideoType) {
        // Parse Vimeo ID from input
        const vimeoId = parseVimeoId(formState.vimeoVideoId.trim());
        if (!vimeoId) {
          setError('Invalid Vimeo URL or ID. Please provide a valid Vimeo video URL or ID.');
          return;
        }

        const payload = {
          title: formState.title.trim(),
          description: formState.description.trim() || undefined,
          assetType: formState.assetType,
          assetTypeId: formState.assetTypeId,
          assetSubtypeId: formState.assetSubtypeId,
          productLine: formState.productLine.trim() || undefined,
          productName: formState.productName.trim() || undefined,
          sku: formState.sku.trim() || undefined,
          vimeoVideoId: vimeoId,
          vimeoDownloadFormats: formState.vimeoDownloadFormats.filter(f => f.url.trim() !== ''),
          tags: formState.selectedTagSlugs,
          audiences: [],
          locales: formState.selectedLocaleCodes.map((code) => ({
            code,
            primary: code === formState.primaryLocale,
          })),
          regions: formState.selectedRegionCodes,
        };

        const headers = buildAuthHeaders(accessToken);
        const response = await fetch('/api/dam/assets', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Upload failed');
        }

        setSuccessMessage('Video asset added successfully.');
        resetForm();
        fetchAssets(accessToken);
        setUploading(false);
        return;
      }

      // Handle file uploads (images, PDFs, documents)
      const file = formState.file!;
      
      // Generate PDF thumbnail if needed (don't block upload if it fails)
      let thumbnailData: string | null = null;
      let thumbnailPath: string | null = null;
      if (file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')) {
        try {
          const thumbnailResult = await generatePDFThumbnail(file);
          if (thumbnailResult) {
            thumbnailData = thumbnailResult.thumbnailData;
            // Generate proper thumbnail path based on asset ID (will be set after asset creation)
            thumbnailPath = `thumb-placeholder.png`; // Will be updated with proper path
          }
        } catch (thumbError) {
          console.error('Thumbnail generation error (continuing without thumbnail):', thumbError);
          // Continue upload even if thumbnail generation fails
        }
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        throw new Error('Supabase URL not configured');
      }

      // For large files (>5MB), use direct upload to Supabase Storage + API route
      // For small files, use API route (faster, but has 4.5MB limit on Vercel)
      const useDirectStorageUpload = file.size > 5 * 1024 * 1024;

      if (useDirectStorageUpload) {
        // Step 1: Call API route to create asset record and get storage path
        // NOTE: Don't send thumbnailData here - it's too large and causes 413 errors
        // We'll send it in the complete request instead
        const payload = {
          title: formState.title.trim(),
          description: formState.description.trim() || undefined,
          assetType: formState.assetType,
          assetTypeId: formState.assetTypeId,
          assetSubtypeId: formState.assetSubtypeId,
          productLine: formState.productLine.trim() || undefined,
          productName: formState.productName.trim() || undefined,
          sku: formState.sku.trim() || undefined,
          tags: formState.selectedTagSlugs,
          audiences: [],
          locales: formState.selectedLocaleCodes.map((code) => ({
            code,
            primary: code === formState.primaryLocale,
          })),
          regions: formState.selectedRegionCodes,
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
        };

        const headers = buildAuthHeaders(accessToken);
        const initResponse = await fetch('/api/dam/assets/init', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify(payload),
        });

        if (!initResponse.ok) {
          const errorData = await initResponse.json().catch(() => ({}));
          console.error('Init route failed:', {
            status: initResponse.status,
            statusText: initResponse.statusText,
            error: errorData,
          });
          // Don't create any database records if init fails
          setActiveUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'error', error: errorData.error || 'Failed to initialize upload' } : u
            )
          );
          throw new Error(errorData.error || `Failed to initialize upload: ${initResponse.status} ${initResponse.statusText}`);
        }

        const { assetId, storagePath } = await initResponse.json();

        // Step 2: Ensure session is properly set on the existing Supabase client
        // The SupabaseProvider should have already set the session, but verify it's working
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !currentSession || !currentSession.access_token) {
          throw new Error('Not authenticated. Please refresh the page and try again.');
        }

        // Verify user is an admin (check before upload to give better error message)
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          throw new Error('Not authenticated. Please refresh the page and try again.');
        }

        // Check if user is an admin
        const { data: adminCheck, error: adminError } = await supabase
          .from('admins')
          .select('id, enabled')
          .eq('id', user.id)
          .single();

        if (adminError || !adminCheck || !adminCheck.enabled) {
          throw new Error('Permission denied. You must be an enabled admin to upload files.');
        }

        // Step 3: Upload file directly to Supabase Storage with progress tracking
        const uploadId = `${assetId}-${Date.now()}`;
        const activeUpload: ActiveUpload = {
          id: uploadId,
          fileName: file.name,
          fileSize: file.size,
          progress: 0,
          status: 'uploading',
          assetId,
          storagePath,
          startTime: Date.now(),
        };
        setActiveUploads((prev) => [...prev, activeUpload]);

        // Use XMLHttpRequest for progress tracking (Supabase JS SDK doesn't support progress)
        const uploadError = await new Promise<string | null>((resolve) => {
          const xhr = new XMLHttpRequest();
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          
          if (!supabaseUrl || !supabaseKey) {
            resolve('Supabase configuration missing');
            return;
          }

          // Get upload URL from Supabase
          const uploadUrl = `${supabaseUrl}/storage/v1/object/dam-assets/${storagePath}`;

          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              setActiveUploads((prev) =>
                prev.map((u) => (u.id === uploadId ? { ...u, progress } : u))
              );
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(null);
            } else {
              try {
                const error = JSON.parse(xhr.responseText);
                resolve(error.message || error.error || `Upload failed with status ${xhr.status}`);
              } catch {
                resolve(`Upload failed with status ${xhr.status}`);
              }
            }
          });

          xhr.addEventListener('error', () => {
            resolve('Network error during upload');
          });

          xhr.addEventListener('abort', () => {
            resolve('Upload cancelled');
          });

          xhr.open('POST', uploadUrl);
          xhr.setRequestHeader('Authorization', `Bearer ${currentSession.access_token}`);
          xhr.setRequestHeader('apikey', supabaseKey);
          xhr.setRequestHeader('x-upsert', 'false');
          xhr.setRequestHeader('cache-control', '3600');
          xhr.send(file);
        });

        if (uploadError) {
          // Rollback: Delete the asset record if file upload fails
          try {
            await fetch(`/api/dam/assets/${assetId}`, {
              method: 'DELETE',
              headers: {
                ...headers,
              },
              credentials: 'same-origin',
            });
          } catch (rollbackError) {
            console.error('Failed to rollback asset record:', rollbackError);
          }
          
          setActiveUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'error', error: uploadError } : u
            )
          );
          
          // Check if it's an RLS policy error
          if (uploadError.includes('row-level security') || uploadError.includes('policy')) {
            throw new Error('Permission denied. Please ensure you are logged in as an enabled admin and the storage policies migration has been run in Supabase.');
          }
          throw new Error(`Failed to upload file: ${uploadError}`);
        }

        // Update status to completing
        setActiveUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'completing', progress: 95 } : u))
        );

        // Step 4: Upload thumbnail directly to storage if we have one
        let uploadedThumbnailPath: string | null = null;
        if (thumbnailData) {
          try {
            const finalThumbnailPath = `${assetId}/${Date.now()}-thumb.png`;
            // Convert base64 to blob
            const thumbnailBytes = Uint8Array.from(atob(thumbnailData), (c) => c.charCodeAt(0));
            const thumbnailBlob = new Blob([thumbnailBytes], { type: 'image/png' });
            
            // Upload thumbnail directly to Supabase Storage
            const { error: thumbUploadError } = await supabase.storage
              .from('dam-assets')
              .upload(finalThumbnailPath, thumbnailBlob, {
                contentType: 'image/png',
                cacheControl: '3600',
                upsert: false,
              });
            
            if (thumbUploadError) {
              console.error('Failed to upload thumbnail:', thumbUploadError);
              // Continue without thumbnail - don't fail the upload
            } else {
              uploadedThumbnailPath = finalThumbnailPath;
            }
          } catch (thumbError) {
            console.error('Error uploading thumbnail:', thumbError);
            // Continue without thumbnail
          }
        }
        
        // Step 5: Notify API route that upload is complete (send only thumbnail path, not data)
        const completeResponse = await fetch(`/api/dam/assets/${assetId}/complete`, {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          credentials: 'same-origin',
          body: JSON.stringify({
            storagePath,
            fileType: file.type || 'application/octet-stream',
            fileName: file.name,
            fileSize: file.size,
            thumbnailPath: uploadedThumbnailPath || undefined,
          }),
        });

        if (!completeResponse.ok) {
          const errorData = await completeResponse.json().catch(() => ({}));
          console.error('Complete route failed:', {
            status: completeResponse.status,
            statusText: completeResponse.statusText,
            error: errorData,
          });
          
          // Rollback: Delete the asset record if complete fails
          try {
            await fetch(`/api/dam/assets/${assetId}`, {
              method: 'DELETE',
              headers: {
                ...headers,
              },
              credentials: 'same-origin',
            });
          } catch (rollbackError) {
            console.error('Failed to rollback asset record:', rollbackError);
          }
          
          setActiveUploads((prev) =>
            prev.map((u) =>
              u.id === uploadId ? { ...u, status: 'error', error: errorData.error || 'Failed to complete upload' } : u
            )
          );
          throw new Error(errorData.error || `Failed to complete upload: ${completeResponse.status} ${completeResponse.statusText}`);
        }

        // Mark upload as successful
        setActiveUploads((prev) =>
          prev.map((u) => (u.id === uploadId ? { ...u, status: 'success', progress: 100 } : u))
        );

        // Remove successful upload from list after 3 seconds
        setTimeout(() => {
          setActiveUploads((prev) => prev.filter((u) => u.id !== uploadId));
        }, 3000);
      } else {
        // For small files, use API route (existing implementation)
        const payload = {
          title: formState.title.trim(),
          description: formState.description.trim() || undefined,
          assetType: formState.assetType,
          productLine: formState.productLine.trim() || undefined,
          sku: formState.sku.trim() || undefined,
          tags: formState.selectedTagSlugs,
          audiences: [],
          locales: formState.selectedLocaleCodes.map((code) => ({
            code,
            primary: code === formState.primaryLocale,
          })),
          regions: formState.selectedRegionCodes,
          thumbnailData: thumbnailData || undefined,
          thumbnailPath: thumbnailData ? `${Date.now()}-thumb.png` : undefined,
        };

        const formData = new FormData();
        formData.append('payload', JSON.stringify(payload));
        formData.append('file', file);

        const headers = buildAuthHeaders(accessToken);
        const response = await fetch('/api/dam/assets', {
          method: 'POST',
          headers: Object.keys(headers).length ? headers : undefined,
          credentials: 'same-origin',
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Upload failed');
        }
      }

      setSuccessMessage('Asset uploaded successfully.');
      resetForm();
      fetchAssets(accessToken);
    } catch (err: any) {
      console.error('Upload failed', err);
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const renderAssetTypePill = (assetType: string, size: 'sm' | 'md' = 'md') => {
    const option = assetTypeOptions.find((opt) => opt.value === assetType);
    const sizeClasses = size === 'sm' 
      ? 'text-[10px] px-1.5 py-0.5'
      : 'text-xs px-2 py-1';
    return (
      <span className={`inline-flex items-center gap-0.5 rounded-md bg-gray-100 ${sizeClasses} text-gray-700`}>
        {option?.icon}
        {option?.label ?? assetType}
      </span>
    );
  };

  const getAcceptAttribute = (assetType: string, assetTypeId?: string | null): string => {
    // Check taxonomy first if available
    if (assetTypeId) {
      const selectedType = assetTypes.find(t => t.id === assetTypeId);
      if (selectedType?.slug === 'image') {
        // Image: finished exports only (JPG/PNG/WebP)
        return '.jpg,.jpeg,.png,.webp';
      }
      if (selectedType?.slug === 'artwork') {
        // Artwork: editable layered files (PSD/AI/EPS/SVG/INDD/CMYK PDFs)
        return '.psd,.ai,.eps,.svg,.indd,.pdf';
      }
    }
    
    // Fallback to legacy enum
    switch (assetType) {
      case 'image':
        return '.jpg,.jpeg,.png,.webp';
      case 'document':
        // PDF, Word (.doc, .docx), Apple Pages (.pages), Google Docs (.gdoc)
        // PowerPoint (.ppt, .pptx), Apple Keynote (.key), Google Slides (.gslides)
        // Excel (.xls, .xlsx), Apple Numbers (.numbers), Google Sheets (.gsheet)
        return '.pdf,.doc,.docx,.pages,.gdoc,.ppt,.pptx,.key,.gslides,.xls,.xlsx,.numbers,.gsheet';
      case 'font':
        return '.ttf,.otf,.woff,.woff2,.eot,.ttc';
      case 'audio':
        return 'audio/*,.mp3,.wav,.m4a,.ogg,.flac,.aac,.wma';
      case 'archive':
        return '.zip,.rar,.7z,.tar,.gz';
      case 'other':
        return '*'; // Allow all file types
      case 'video':
        return ''; // Videos are handled via Vimeo, not file upload
      default:
        return '*';
    }
  };

  const validateFileType = (file: File, assetType: string, assetTypeId?: string | null): boolean => {
    const fileName = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();

    // Check taxonomy first if available
    if (assetTypeId) {
      const selectedType = assetTypes.find(t => t.id === assetTypeId);
      if (selectedType?.slug === 'image') {
        // Image: finished exports only (JPG/PNG/WebP) - NO PSD/AI/SVG
        return /\.(jpg|jpeg|png|webp)$/i.test(fileName) || 
               (mimeType.startsWith('image/') && !mimeType.includes('svg') && !mimeType.includes('x-photoshop'));
      }
      if (selectedType?.slug === 'artwork') {
        // Artwork: editable layered files (PSD/AI/EPS/SVG/INDD/CMYK PDFs)
        return /\.(psd|ai|eps|svg|indd|pdf)$/i.test(fileName) ||
               mimeType.includes('photoshop') ||
               mimeType.includes('illustrator') ||
               mimeType.includes('svg') ||
               mimeType.includes('pdf');
      }
    }

    // Fallback to legacy enum
    switch (assetType) {
      case 'image':
        // Legacy: allow all images, but warn if it's a design file
        if (/\.(psd|ai|eps|indd)$/i.test(fileName)) {
          alert('Warning: This appears to be a design file (PSD/AI/EPS/INDD). Consider using "Artwork" type instead of "Image".');
        }
        return mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
      case 'document':
        return /\.(pdf|doc|docx|pages|gdoc|ppt|pptx|key|gslides|xls|xlsx|numbers|gsheet)$/i.test(fileName) ||
               mimeType.includes('pdf') ||
               mimeType.includes('msword') ||
               mimeType.includes('presentation') ||
               mimeType.includes('spreadsheet') ||
               mimeType.includes('vnd.openxmlformats');
      case 'font':
        return /\.(ttf|otf|woff|woff2|eot|ttc)$/i.test(fileName) ||
               mimeType.includes('font') ||
               mimeType.includes('x-font');
      case 'audio':
        return mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac|aac|wma)$/i.test(fileName);
      case 'archive':
        return /\.(zip|rar|7z|tar|gz)$/i.test(fileName) ||
               mimeType.includes('zip') ||
               mimeType.includes('rar') ||
               mimeType.includes('x-7z-compressed') ||
               mimeType.includes('x-tar') ||
               mimeType.includes('gzip');
      case 'other':
        return true; // Allow all file types
      case 'video':
        return false; // Videos should use Vimeo
      default:
        return true;
    }
  };

  const ensureTokenUrl = useCallback(
    (url?: string | null) => {
      if (!url) return url ?? '';
      if (!accessToken) return url;
      const separator = url.includes('?') ? '&' : '?';
      return `${url}${separator}token=${encodeURIComponent(accessToken)}`;
    },
    [accessToken]
  );

  const fetchAssetVersions = async (assetId: string) => {
    if (!accessToken) return;
    
    try {
      setLoadingVersions(true);
      const headers = buildAuthHeaders(accessToken);
      const response = await fetch(`/api/dam/assets/${assetId}/versions`, {
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        throw new Error('Failed to load versions');
      }

      const data = await response.json() as { versions?: any[] };
      setAssetVersions(data.versions || []);
    } catch (err: any) {
      console.error('Failed to fetch versions', err);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Helper to get filter chips for active filters
  const getActiveFilterChips = () => {
    const chips: Array<{ label: string; onRemove: () => void }> = [];
    
    if (assetTypeFilter) {
      const type = assetTypes.find(t => t.id === assetTypeFilter);
      if (type) {
        chips.push({
          label: type.name,
          onRemove: () => {
            setAssetTypeFilter('');
            setAssetSubtypeFilter('');
          },
        });
      }
    }
    
    if (assetSubtypeFilter) {
      const subtype = assetSubtypes.find(s => s.id === assetSubtypeFilter);
      if (subtype) {
        chips.push({
          label: subtype.name,
          onRemove: () => setAssetSubtypeFilter(''),
        });
      }
    }
    
    if (productLineFilter) {
      chips.push({
        label: productLineFilter,
        onRemove: () => setProductLineFilter(''),
      });
    }
    
    if (productNameFilter) {
      chips.push({
        label: productNameFilter,
        onRemove: () => setProductNameFilter(''),
      });
    }
    
    if (localeFilter) {
      const locale = locales.find(l => l.code === localeFilter);
      if (locale) {
        chips.push({
          label: locale.label,
          onRemove: () => setLocaleFilter(''),
        });
      }
    }
    
    if (regionFilter) {
      const region = regions.find(r => r.code === regionFilter);
      if (region) {
        chips.push({
          label: region.label,
          onRemove: () => setRegionFilter(''),
        });
      }
    }
    
    if (tagFilter) {
      chips.push({
        label: tagFilter,
        onRemove: () => setTagFilter(''),
      });
    }
    
    return chips;
  };

  return (
    <div className="relative min-h-screen bg-gray-50">
      {/* Main Content - Full Width */}
      <div className="w-full">
        {/* Header with Search Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Large Search Bar */}
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="search"
                placeholder="Search assets by title, tag, SKU, product…"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-md border border-gray-300 focus:border-black focus:outline-none focus:ring-1 focus:ring-black/10 text-sm"
              />
            </div>
            
            {/* View Mode Toggle - Segmented Control */}
            <div className="inline-flex items-center rounded-lg border border-gray-300 bg-gray-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode('compact')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === 'compact'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Compact
              </button>
              <button
                type="button"
                onClick={() => setViewMode('comfortable')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                  viewMode === 'comfortable'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                Comfortable
              </button>
            </div>
            
            {/* Upload Button */}
            <button
              type="button"
              onClick={() => setIsUploadDrawerOpen(true)}
              className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90"
            >
              <ArrowUpTrayIcon className="h-4 w-4" />
              Upload Asset
            </button>
            
            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => {
                setCurrentPage(1);
                fetchAssets(accessToken ?? '', undefined, 1);
              }}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 w-9 h-9 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
            >
              <ArrowPathIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Active Uploads Banner */}
        {activeUploads.length > 0 && (
          <div className="bg-white border-b border-gray-200 px-6 py-3">
            <div className="space-y-2">
              {activeUploads.map((upload) => (
                <div key={upload.id} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{upload.fileName}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className={`h-full transition-all duration-300 ${
                            upload.status === 'error'
                              ? 'bg-red-500'
                              : upload.status === 'success'
                              ? 'bg-green-500'
                              : 'bg-black'
                          }`}
                          style={{ width: `${upload.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 whitespace-nowrap">{upload.progress}%</span>
                    </div>
                  </div>
                  {upload.status === 'error' && upload.error && (
                    <span className="text-xs text-red-600 whitespace-nowrap">{upload.error}</span>
                  )}
                  {upload.status === 'success' && (
                    <span className="text-xs text-green-600 whitespace-nowrap">✓ Complete</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Row */}
        <div className="bg-white border-b border-gray-200 px-6 py-1.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Filter Dropdowns */}
            <select
              value={assetTypeFilter}
              onChange={(event) => {
                setAssetTypeFilter(event.target.value);
                setAssetSubtypeFilter('');
              }}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Asset Type</option>
              {assetTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>

            <select
              value={assetSubtypeFilter}
              onChange={(event) => setAssetSubtypeFilter(event.target.value)}
              disabled={!assetTypeFilter}
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-black focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed bg-white"
            >
              <option value="">Sub-Type</option>
              {assetSubtypes
                .filter((subtype) => subtype.asset_type_id === assetTypeFilter)
                .map((subtype) => (
                  <option key={subtype.id} value={subtype.id}>
                    {subtype.name}
                  </option>
                ))}
            </select>

            <select
              value={productLineFilter}
              onChange={(event) => setProductLineFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Product Line</option>
              <option value="ProCtrl">ProCtrl</option>
              <option value="SelfCtrl">SelfCtrl</option>
              <option value="Both">Both</option>
              <option value="None">None</option>
            </select>

            <select
              value={productNameFilter}
              onChange={(event) => setProductNameFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Product</option>
              {PRODUCT_NAME_OPTIONS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={localeFilter}
              onChange={(event) => setLocaleFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Locale</option>
              {locales.map((locale) => (
                <option key={locale.code} value={locale.code}>
                  {locale.label}
                </option>
              ))}
            </select>

            <select
              value={regionFilter}
              onChange={(event) => setRegionFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Region</option>
              {regions.map((region) => (
                <option key={region.code} value={region.code}>
                  {region.label}
                </option>
              ))}
            </select>

            <select
              value={tagFilter}
              onChange={(event) => setTagFilter(event.target.value)}
              className="rounded-md border border-gray-300 px-2.5 py-1 text-xs focus:border-black focus:outline-none bg-white h-8"
            >
              <option value="">Tag</option>
              {tags.map((tag) => (
                <option key={tag.slug} value={tag.label}>
                  {tag.label}
                </option>
              ))}
            </select>
          </div>

          {/* Filter Chips */}
          {getActiveFilterChips().length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5 pt-1.5 border-t border-gray-100">
              {getActiveFilterChips().map((chip, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                >
                  {chip.label}
                  <button
                    type="button"
                    onClick={chip.onRemove}
                    className="hover:text-gray-900"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Asset Library - Full Width */}
        <div className="px-6 py-4 border-t border-gray-100">
          {/* Advanced Search Accordion */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setShowAdvancedSearch(!showAdvancedSearch)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <h4 className="text-sm font-semibold text-gray-900">Advanced Search</h4>
              <svg
                className={`h-5 w-5 text-gray-500 transition-transform ${showAdvancedSearch ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showAdvancedSearch && (
              <div className="px-4 pb-4 border-t border-gray-200">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4 pt-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date From</label>
                    <input
                      type="date"
                      value={dateFromFilter}
                      onChange={(event) => setDateFromFilter(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Date To</label>
                    <input
                      type="date"
                      value={dateToFilter}
                      onChange={(event) => setDateToFilter(event.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Min File Size (MB)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fileSizeMinFilter}
                      onChange={(event) => setFileSizeMinFilter(event.target.value)}
                      placeholder="0"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Max File Size (MB)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={fileSizeMaxFilter}
                      onChange={(event) => setFileSizeMaxFilter(event.target.value)}
                      placeholder="∞"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    />
                  </div>
                </div>
                {(dateFromFilter || dateToFilter || fileSizeMinFilter || fileSizeMaxFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setDateFromFilter('');
                      setDateToFilter('');
                      setFileSizeMinFilter('');
                      setFileSizeMaxFilter('');
                      setCurrentPage(1);
                      fetchAssets(accessToken ?? '', searchTerm || undefined, 1);
                    }}
                    className="mt-3 text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Clear advanced filters
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Asset Grid */}
          {loadingAssets ? (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <div className="flex items-center gap-3 text-sm">
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Loading assets…
              </div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-600">
              No assets found. Upload assets to populate the library.
            </div>
          ) : (
            <>
              {/* Bulk Actions Bar */}
              {selectedAssetIds.size > 0 && (
                <div className="mb-4 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <span className="text-sm font-medium text-blue-900">
                    {selectedAssetIds.size} asset{selectedAssetIds.size !== 1 ? 's' : ''} selected
                  </span>
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    disabled={bulkDeleting}
                    className="inline-flex items-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <TrashIcon className="h-4 w-4" />
                    {bulkDeleting ? 'Deleting...' : `Delete ${selectedAssetIds.size}`}
                  </button>
                </div>
              )}
              
              {/* Select All */}
              {filteredAssets.length > 0 && (
                <div className="mb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
                  >
                    <div className={`flex h-4 w-4 items-center justify-center rounded border-2 ${
                      selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {selectedAssetIds.size === filteredAssets.length && filteredAssets.length > 0 && (
                        <CheckIcon className="h-3 w-3 text-white" />
                      )}
                    </div>
                    <span>Select All</span>
                  </button>
                </div>
              )}

              {/* Asset Grid - Beautiful Cards */}
              <div className={`grid gap-2 ${
                viewMode === 'compact'
                  ? 'grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'
                  : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
              }`}>
                {filteredAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group relative bg-white rounded-md border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-all cursor-pointer"
                      style={{ maxWidth: viewMode === 'compact' ? '240px' : 'none' }}
                      onMouseEnter={() => setHoveredAssetId(asset.id)}
                      onMouseLeave={() => setHoveredAssetId(null)}
                      onClick={() => {
                        setSelectedAsset(asset);
                        if (accessToken) {
                          fetchAssetVersions(asset.id);
                        }
                      }}
                    >
                      {/* Selection Checkbox */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleAssetSelection(asset.id);
                        }}
                        className={`absolute top-1.5 left-1.5 z-20 flex h-4 w-4 items-center justify-center rounded border-2 bg-white shadow-sm transition ${
                          selectedAssetIds.has(asset.id) ? 'border-blue-600 bg-blue-600' : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {selectedAssetIds.has(asset.id) && (
                          <CheckIcon className="h-2.5 w-2.5 text-white" />
                        )}
                      </button>

                      {/* Thumbnail */}
                      <div className="relative bg-gray-100 overflow-hidden" style={{ height: viewMode === 'compact' ? '160px' : '200px' }}>
                        {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                          <img
                            src={`https://vumbnail.com/${asset.vimeo_video_id}.jpg`}
                            alt={asset.title}
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = `https://i.vimeocdn.com/video/${asset.vimeo_video_id}_640.jpg`;
                            }}
                          />
                        ) : accessToken && asset.current_version?.previewPath ? (
                          <img
                            src={ensureTokenUrl(asset.current_version.previewPath)}
                            alt={asset.title}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-gray-400">
                            <PhotoIcon className="h-12 w-12" />
                          </div>
                        )}
                        
                        {/* Version Badge */}
                        {asset.current_version && (
                          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                            v{asset.current_version.version_number}
                          </span>
                        )}

                        {/* Hover Overlay with Actions */}
                        {hoveredAssetId === asset.id && (
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/30 to-transparent flex items-center justify-center gap-1.5 transition-opacity duration-200">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedAsset(asset);
                                if (accessToken) {
                                  fetchAssetVersions(asset.id);
                                }
                              }}
                              className="rounded-md bg-white/95 p-1 hover:bg-white transition shadow-sm"
                              title="View"
                            >
                              <EyeIcon className="h-3.5 w-3.5 text-gray-900" />
                            </button>
                            {asset.current_version?.downloadPath && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!accessToken) return;
                                  const downloadUrl = ensureTokenUrl(asset.current_version!.downloadPath!);
                                  const filename = `${asset.title || 'asset'}.${asset.current_version!.mime_type?.split('/')[1] || 'bin'}`;
                                  await triggerDownload(downloadUrl, filename, asset.id, 'api', accessToken);
                                }}
                                className="rounded-md bg-white/95 p-1 hover:bg-white transition shadow-sm"
                                title="Download"
                              >
                                <ArrowDownTrayIcon className="h-3.5 w-3.5 text-gray-900" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteAsset(asset.id);
                              }}
                              className="rounded-md bg-white/95 p-1 hover:bg-white transition shadow-sm"
                              title="Delete"
                            >
                              <TrashIcon className="h-3.5 w-3.5 text-red-600" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="p-2 space-y-1">
                        <h4 className="text-xs font-semibold text-gray-900 truncate leading-tight">{asset.title}</h4>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {renderAssetTypePill(asset.asset_type, 'sm')}
                          {asset.asset_subtype_id ? (() => {
                            const subtype = assetSubtypes.find(s => s.id === asset.asset_subtype_id);
                            return subtype ? (
                              <span className="text-[10px] text-gray-600 truncate">{subtype.name}</span>
                            ) : null;
                          })() : asset.locales.length > 0 && (
                            <span className="text-[10px] text-gray-500">{asset.locales[0].code}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
          
          {/* Pagination */}
          {pagination && pagination.total > 0 && (
            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{(pagination.page - 1) * pagination.limit + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(pagination.page * pagination.limit, pagination.total)}
                </span>{' '}
                of <span className="font-medium">{pagination.total}</span> assets
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const newPage = currentPage - 1;
                    setCurrentPage(newPage);
                    fetchAssets(accessToken ?? '', searchTerm || undefined, newPage);
                  }}
                  disabled={!pagination.hasPreviousPage}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const newPage = currentPage + 1;
                    setCurrentPage(newPage);
                    fetchAssets(accessToken ?? '', searchTerm || undefined, newPage);
                  }}
                  disabled={!pagination.hasNextPage}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Drawer - Slide Over */}
      {isUploadDrawerOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 transition-opacity"
            onClick={() => setIsUploadDrawerOpen(false)}
          />
          
          {/* Drawer */}
          <div className="absolute right-0 top-0 h-full w-full max-w-[500px] bg-white shadow-xl flex flex-col">
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Upload Asset</h2>
              <button
                type="button"
                onClick={() => setIsUploadDrawerOpen(false)}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Drawer Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {error && (
                <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </div>
              )}
              {successMessage && (
                <div className="mb-3 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                  {successMessage}
                </div>
              )}
              
              <form id="upload-form" onSubmit={handleUpload} className="pb-4">
                {/* Section 1: Basic Information */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Basic Information</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Title *</label>
                      <input
                        type="text"
                        value={formState.title}
                        onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Description</label>
                      <textarea
                        value={formState.description}
                        onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                        rows={2}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 mb-5"></div>

                {/* Section 2: Asset Taxonomy */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Asset Taxonomy</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">Asset Type *</label>
                      <select
                        value={formState.assetTypeId || ''}
                        onChange={(event) => {
                          const selectedTypeId = event.target.value || null;
                          setFormState((prev) => ({ 
                            ...prev, 
                            assetTypeId: selectedTypeId,
                            assetSubtypeId: null,
                            assetType: selectedTypeId ? (() => {
                              const selectedType = assetTypes.find(t => t.id === selectedTypeId);
                              if (!selectedType) return prev.assetType;
                              const slugToEnumMap: Record<string, string> = {
                                'image': 'image',
                                'video': 'video',
                                'document': 'document',
                                'artwork': 'document',
                                'audio': 'audio',
                                'packaging-regulatory': 'document',
                                'campaign': 'document',
                              };
                              return slugToEnumMap[selectedType.slug] || 'other';
                            })() : prev.assetType,
                            file: null
                          }));
                        }}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                        required
                      >
                        <option value="">Select Asset Type</option>
                        {assetTypes.map((type) => (
                          <option key={type.id} value={type.id}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                      {(() => {
                        const selectedType = assetTypes.find(t => t.id === formState.assetTypeId);
                        if (selectedType?.slug === 'image') {
                          return (
                            <p className="mt-1 text-[10px] text-blue-600 leading-tight">
                              <strong>Image:</strong> Finished, exported visuals (JPG/PNG/WebP). No layers.
                            </p>
                          );
                        }
                        if (selectedType?.slug === 'artwork') {
                          return (
                            <p className="mt-1 text-[10px] text-purple-600 leading-tight">
                              <strong>Artwork:</strong> Editable layered files (PSD/AI/EPS/SVG/INDD/CMYK PDFs). For designers.
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1.5">
                        Asset Sub-Type {formState.assetTypeId ? '*' : ''}
                      </label>
                      <select
                        value={formState.assetSubtypeId || ''}
                        onChange={(event) => {
                          setFormState((prev) => ({ 
                            ...prev, 
                            assetSubtypeId: event.target.value || null 
                          }));
                        }}
                        disabled={!formState.assetTypeId}
                        className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed h-8"
                        required={!!formState.assetTypeId}
                      >
                        <option value="">Select Sub-Type</option>
                        {assetSubtypes
                          .filter((subtype) => subtype.asset_type_id === formState.assetTypeId)
                          .map((subtype) => (
                            <option key={subtype.id} value={subtype.id}>
                              {subtype.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 mb-5"></div>

                {/* Section 3: Product Information */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Product Information</h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Product Line</label>
                        <select
                          value={formState.productLine}
                          onChange={(event) => setFormState((prev) => ({ ...prev, productLine: event.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                        >
                          <option value="">None</option>
                          <option value="ProCtrl">ProCtrl</option>
                          <option value="SelfCtrl">SelfCtrl</option>
                          <option value="Both">Both</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">Product Name</label>
                        <select
                          value={formState.productName}
                          onChange={(event) => setFormState((prev) => ({ ...prev, productName: event.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                        >
                          <option value="">Select Product</option>
                          {PRODUCT_NAME_OPTIONS.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {formState.productName && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1.5">SKU</label>
                        <input
                          type="text"
                          value={formState.sku}
                          onChange={(event) => setFormState((prev) => ({ ...prev, sku: event.target.value }))}
                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                          placeholder="Optional"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-gray-100 mb-5"></div>

                {/* Section 4: Tags */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Tags</h3>
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag) => {
                        const selected = formState.selectedTagSlugs.includes(tag.slug);
                        return (
                          <button
                            type="button"
                            key={tag.slug}
                            onClick={() =>
                              setFormState((prev) => ({
                                ...prev,
                                selectedTagSlugs: toggleSelection(prev.selectedTagSlugs, tag.slug),
                              }))
                            }
                            className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
                              selected
                                ? 'border-black bg-black text-white'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
                            }`}
                          >
                            {tag.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={newTagLabel}
                        onChange={(event) => setNewTagLabel(event.target.value)}
                        className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                        placeholder="Add new tag"
                      />
                      <button
                        type="button"
                        onClick={handleAddTag}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 h-8"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 mb-5"></div>

                {/* Section 5: Locales & Regions */}
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Locales & Regions</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-medium text-gray-700">Locales *</label>
                        <button
                          type="button"
                          onClick={async () => {
                            const code = prompt('Enter locale code (e.g., de-DE for German):');
                            if (!code) return;
                            const label = prompt('Enter locale label (e.g., German):');
                            if (!label) return;
                            
                            try {
                              const headers = buildAuthHeaders(accessToken);
                              const response = await fetch('/api/dam/lookups', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  ...headers,
                                },
                                credentials: 'same-origin',
                                body: JSON.stringify({
                                  action: 'add-locale',
                                  code: code.trim(),
                                  label: label.trim(),
                                }),
                              });
                              
                              if (!response.ok) {
                                const error = await response.json().catch(() => ({}));
                                throw new Error(error.error || 'Failed to add locale');
                              }
                              
                              const data = await response.json();
                              setLocales(data.locales || []);
                              alert('Locale added successfully!');
                            } catch (err: any) {
                              alert('Failed to add locale: ' + err.message);
                            }
                          }}
                          className="text-[10px] text-blue-600 hover:text-blue-800 underline"
                        >
                          + Add Language
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        {locales.map((locale) => {
                          const selected = formState.selectedLocaleCodes.includes(locale.code);
                          return (
                            <div key={locale.code} className="flex items-center justify-between rounded-md border border-gray-200 px-2.5 py-1.5">
                              <label className="flex items-center gap-2 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => handleLocaleToggle(locale.code)}
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-black"
                                />
                                <span>{locale.label}</span>
                              </label>
                              {selected && (
                                <label className="flex items-center gap-1 text-[10px] text-gray-600">
                                  <input
                                    type="radio"
                                    name="primary-locale"
                                    checked={formState.primaryLocale === locale.code}
                                    onChange={() => handlePrimaryLocaleChange(locale.code)}
                                    className="h-3 w-3"
                                  />
                                  Primary
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Regions - Collapsible */}
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowRegions(!showRegions)}
                        className="flex items-center justify-between w-full text-xs font-medium text-gray-700 mb-2"
                      >
                        <span>Region Restrictions (Optional)</span>
                        <svg
                          className={`h-3 w-3 text-gray-500 transition-transform ${showRegions ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showRegions && (
                        <div className="grid grid-cols-2 gap-1.5 pt-1">
                          {regions.map((region) => {
                            const selected = formState.selectedRegionCodes.includes(region.code);
                            return (
                              <label key={region.code} className="flex items-center gap-1.5 text-xs text-gray-700">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() =>
                                    setFormState((prev) => ({
                                      ...prev,
                                      selectedRegionCodes: toggleSelection(prev.selectedRegionCodes, region.code),
                                    }))
                                  }
                                  className="h-3.5 w-3.5 rounded border-gray-300 text-black focus:ring-black"
                                />
                                <span>{region.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-gray-100 mb-5"></div>

                {/* Section 6: File Upload or Video Input */}
                <div className="mb-5">
                  {(() => {
                    const selectedAssetType = assetTypes.find(t => t.id === formState.assetTypeId);
                    const isVideoType = selectedAssetType?.slug === 'video';
                    const isRegulatoryType = selectedAssetType?.slug === 'packaging-regulatory';
                    
                    if (isVideoType) {
                      return (
                        <div>
                          <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-2.5">Video Options</h3>
                          <div className="space-y-2.5">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1.5">Vimeo Video ID or URL *</label>
                              <input
                                type="text"
                                value={formState.vimeoVideoId}
                                onChange={(event) => setFormState((prev) => ({ ...prev, vimeoVideoId: event.target.value }))}
                                className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-black focus:outline-none h-8"
                                placeholder="e.g., 123456789 or https://vimeo.com/123456789"
                                required
                              />
                              <p className="mt-1 text-[10px] text-gray-500 leading-tight">
                                This is the main video link used to embed the player in the detail modal. Enter the Vimeo URL or numeric ID.
                              </p>
                            </div>
                            
                            {/* Collapsible Download Formats Card */}
                            <div className="border border-gray-200 rounded-md bg-[#fafafa] overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setShowVideoDownloadFormats(!showVideoDownloadFormats)}
                                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <svg
                                    className={`h-3.5 w-3.5 text-gray-500 flex-shrink-0 transition-transform ${showVideoDownloadFormats ? 'rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-xs font-medium text-gray-900">Download Formats (Optional)</div>
                                    <div className="text-[10px] text-gray-500 mt-0.5">Add direct download URLs for different video qualities (4K, 2K, 1080p, etc.).</div>
                                  </div>
                                </div>
                              </button>
                              {showVideoDownloadFormats && (
                                <div className="px-4 pb-4 pt-2 border-t border-gray-200 space-y-2.5">
                                  {formState.vimeoDownloadFormats.map((format, index) => (
                                    <div key={index} className="flex items-start gap-2">
                                      <div className="flex-1">
                                        <label className="block text-[10px] text-gray-600 mb-1">Resolution</label>
                                        <select
                                          value={format.resolution}
                                          onChange={(e) => {
                                            const newFormats = [...formState.vimeoDownloadFormats];
                                            newFormats[index].resolution = e.target.value;
                                            setFormState((prev) => ({ ...prev, vimeoDownloadFormats: newFormats }));
                                          }}
                                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-black focus:outline-none h-7"
                                        >
                                          {RESOLUTION_OPTIONS.map((res) => (
                                            <option key={res} value={res}>
                                              {res}
                                            </option>
                                          ))}
                                        </select>
                                      </div>
                                      <div className="flex-1">
                                        <label className="block text-[10px] text-gray-600 mb-1">Download URL</label>
                                        <input
                                          type="text"
                                          value={format.url}
                                          onChange={(e) => {
                                            const newFormats = [...formState.vimeoDownloadFormats];
                                            newFormats[index].url = e.target.value;
                                            setFormState((prev) => ({ ...prev, vimeoDownloadFormats: newFormats }));
                                          }}
                                          className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-xs focus:border-black focus:outline-none h-7"
                                          placeholder="https://..."
                                        />
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const newFormats = formState.vimeoDownloadFormats.filter((_, i) => i !== index);
                                          setFormState((prev) => ({ ...prev, vimeoDownloadFormats: newFormats }));
                                        }}
                                        className="mt-5 text-red-600 hover:text-red-700"
                                        title="Remove format"
                                      >
                                        <XMarkIcon className="h-4 w-4" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setFormState((prev) => ({
                                        ...prev,
                                        vimeoDownloadFormats: [...prev.vimeoDownloadFormats, { resolution: '1080p', url: '' }],
                                      }));
                                    }}
                                    className="w-full mt-2 flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add Download Format
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    }
                    
                    // For non-video types, show file upload
                    return (
                      <div>
                        <h3 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">File Upload</h3>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1.5">File *</label>
                          <input
                            type="file"
                            accept={getAcceptAttribute(formState.assetType, formState.assetTypeId)}
                            onChange={(event) => {
                              const file = event.target.files ? event.target.files[0] : null;
                              if (file) {
                                const isValid = validateFileType(file, formState.assetType, formState.assetTypeId);
                                if (!isValid) {
                                  const selectedType = assetTypes.find(t => t.id === formState.assetTypeId);
                                  const typeName = selectedType?.name || formState.assetType;
                                  alert(`Invalid file type. Please select a ${typeName} file.`);
                                  event.target.value = '';
                                  return;
                                }
                                const selectedType = assetTypes.find(t => t.id === formState.assetTypeId);
                                if (selectedType?.slug === 'image' && /\.(psd|ai|eps|indd|svg)$/i.test(file.name)) {
                                  if (!confirm('Warning: This appears to be a design file (PSD/AI/EPS/INDD/SVG). Design files should use "Artwork" type, not "Image". Continue anyway?')) {
                                    event.target.value = '';
                                    return;
                                  }
                                }
                                if (selectedType?.slug === 'artwork' && /\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
                                  if (!confirm('Warning: This appears to be a finished image (JPG/PNG/WebP). Finished images should use "Image" type, not "Artwork". Continue anyway?')) {
                                    event.target.value = '';
                                    return;
                                  }
                                }
                              }
                              setFormState((prev) => ({ ...prev, file }));
                            }}
                            className="block w-full text-xs text-gray-700 file:mr-4 file:rounded-md file:border file:border-gray-200 file:bg-white file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:border-gray-400"
                            required={!isVideoType}
                          />
                          {formState.file && (
                            <p className="mt-1.5 text-[10px] text-gray-500">
                              {formState.file.name} • {formatBytes(formState.file.size)}
                            </p>
                          )}
                          {isRegulatoryType && (
                            <p className="mt-1.5 text-[10px] text-amber-600">
                              ⚠ For regulatory assets, Product selection is recommended.
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </form>
            </div>

            {/* Sticky Footer with Actions */}
            <div className="border-t border-gray-200 bg-white px-5 py-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  form="upload-form"
                  disabled={uploading}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <ArrowUpTrayIcon className="h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Upload Asset'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsUploadDrawerOpen(false);
                  }}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset Detail Modal - Two Column Layout */}
      {selectedAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedAsset(null);
              setIsEditingAsset(false);
            }
          }}
        >
          <div className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden flex flex-col">
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                setSelectedAsset(null);
                setIsEditingAsset(false);
                setAssetVersions([]);
              }}
              className="absolute top-3 right-3 z-20 rounded-md bg-white/90 p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 transition shadow-sm"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>

            {/* Two Column Layout */}
            <div className="flex flex-col lg:flex-row h-full overflow-hidden">
              {/* Left Column - Preview */}
              <div className="lg:w-[55%] bg-gray-50 flex items-center justify-center p-6 min-h-[400px]">
                {selectedAsset.asset_type === 'video' && selectedAsset.vimeo_video_id ? (
                  <div className="w-full max-w-3xl">
                    <div className="relative w-full rounded-md overflow-hidden shadow-md" style={{ aspectRatio: '16/9' }}>
                      <iframe
                        src={`https://player.vimeo.com/video/${selectedAsset.vimeo_video_id}?byline=0&title=0&portrait=0`}
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full border-0"
                        title={selectedAsset.title || 'Video'}
                      />
                    </div>
                  </div>
                ) : selectedAsset.current_version?.previewPath && accessToken ? (
                  <div className="w-full max-w-3xl">
                    <img
                      src={ensureTokenUrl(selectedAsset.current_version.previewPath)}
                      alt={selectedAsset.title}
                      className="w-full h-auto max-h-[70vh] object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <PhotoIcon className="h-24 w-24 mb-4" />
                    <p className="text-sm">No preview available</p>
                  </div>
                )}
              </div>

              {/* Right Column - Metadata */}
              <div className="lg:w-[45%] bg-white overflow-y-auto p-5 border-l border-gray-200">
                {/* Header */}
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <div className="flex items-start gap-2 mb-2">
                    <h2 className="text-lg font-semibold text-gray-900 flex-1">{selectedAsset.title || 'Untitled Asset'}</h2>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    {renderAssetTypePill(selectedAsset.asset_type)}
                  </div>
                  {selectedAsset.description && (
                    <p className="text-sm text-gray-600 leading-relaxed">{selectedAsset.description}</p>
                  )}
                </div>

              {/* Download Section */}
              <div className="mb-4 pb-4 border-b border-gray-100">
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Downloads</h3>
                  {selectedAsset.asset_type === 'video' && selectedAsset.vimeo_video_id && (
                    <button
                      type="button"
              onClick={() => {
                if (!isEditingAsset) {
                  setIsEditingAsset(true);
                  setEditingDownloadUrls({
                    vimeo_download_1080p: selectedAsset.vimeo_download_1080p || '',
                    vimeo_download_720p: selectedAsset.vimeo_download_720p || '',
                    vimeo_download_480p: selectedAsset.vimeo_download_480p || '',
                    vimeo_download_360p: selectedAsset.vimeo_download_360p || '',
                  });
                } else {
                  setIsEditingAsset(false);
                }
              }}
                      className="text-sm text-blue-600 hover:text-blue-800 underline"
                    >
                      {isEditingAsset ? 'Cancel' : 'Edit URLs'}
                    </button>
                  )}
                </div>
                
                {selectedAsset.asset_type === 'video' && selectedAsset.vimeo_video_id ? (
                  <div className="space-y-4">
                    {isEditingAsset ? (
                      <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                        {editingDownloadUrls.map((format, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Resolution</label>
                              <select
                                value={format.resolution}
                                onChange={(e) => {
                                  const newFormats = [...editingDownloadUrls];
                                  newFormats[index].resolution = e.target.value;
                                  setEditingDownloadUrls(newFormats);
                                }}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              >
                                {RESOLUTION_OPTIONS.map((res) => (
                                  <option key={res} value={res}>
                                    {res}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex-1">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Download URL</label>
                              <input
                                type="text"
                                value={format.url}
                                onChange={(e) => {
                                  const newFormats = [...editingDownloadUrls];
                                  newFormats[index].url = e.target.value;
                                  setEditingDownloadUrls(newFormats);
                                }}
                                placeholder="https://..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const newFormats = editingDownloadUrls.filter((_, i) => i !== index);
                                setEditingDownloadUrls(newFormats);
                              }}
                              className="mt-6 text-red-600 hover:text-red-700"
                              title="Remove format"
                            >
                              <XMarkIcon className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDownloadUrls([...editingDownloadUrls, { resolution: '1080p', url: '' }]);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                          Add Download Format
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!accessToken) return;
                            setSavingUrls(true);
                            try {
                              const response = await fetch(`/api/dam/assets/${selectedAsset.id}`, {
                                method: 'PATCH',
                                headers: {
                                  'Content-Type': 'application/json',
                                  ...buildAuthHeaders(accessToken),
                                },
                                credentials: 'same-origin',
                                body: JSON.stringify({
                                  vimeo_download_formats: editingDownloadUrls.filter(f => f.url.trim() !== ''),
                                }),
                              });
                              if (!response.ok) {
                                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                                throw new Error(errorData.error || 'Failed to update URLs');
                              }
                              const updated = await response.json();
                              // Update the selected asset with new data
                              setSelectedAsset(prev => prev ? { ...prev, ...updated } : null);
                              setIsEditingAsset(false);
                              // Refresh the asset list in background
                              fetchAssets(accessToken, undefined, currentPage);
                            } catch (err: any) {
                              alert('Failed to save: ' + err.message);
                            } finally {
                              setSavingUrls(false);
                            }
                          }}
                          disabled={savingUrls}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                        >
                          {savingUrls ? 'Saving...' : 'Save URLs'}
                        </button>
                      </div>
                    ) : (
                      <>
                        {/* Progressive download buttons */}
                        {(() => {
                          // Use new format if available, otherwise fall back to legacy fields
                          const downloadFormats = selectedAsset.vimeo_download_formats && selectedAsset.vimeo_download_formats.length > 0
                            ? selectedAsset.vimeo_download_formats
                            : [
                                ...(selectedAsset.vimeo_download_1080p ? [{ resolution: '1080p', url: selectedAsset.vimeo_download_1080p }] : []),
                                ...(selectedAsset.vimeo_download_720p ? [{ resolution: '720p', url: selectedAsset.vimeo_download_720p }] : []),
                                ...(selectedAsset.vimeo_download_480p ? [{ resolution: '480p', url: selectedAsset.vimeo_download_480p }] : []),
                                ...(selectedAsset.vimeo_download_360p ? [{ resolution: '360p', url: selectedAsset.vimeo_download_360p }] : []),
                              ];
                          
                          return downloadFormats.length > 0 ? (
                            downloadFormats
                              .filter((format) => format.url && typeof format.url === 'string' && format.url.trim() !== '')
                              .map((format) => (
                                <button
                                  key={format.resolution}
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    const filename = `${selectedAsset.title || 'video'}-${format.resolution}.mp4`;
                                    await triggerDownload(
                                      format.url!,
                                      filename,
                                      selectedAsset.id,
                                      `video-${format.resolution}`,
                                      accessToken
                                    );
                                  }}
                                  className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition mr-2"
                                >
                                  <ArrowDownTrayIcon className="h-4 w-4" />
                                  Download {format.resolution}
                                </button>
                              ))
                          ) : null;
                        })()}
                        
                        {/* Show message if no download URLs configured */}
                        {(() => {
                          const hasFormats = selectedAsset.vimeo_download_formats && selectedAsset.vimeo_download_formats.length > 0;
                          const hasLegacy = selectedAsset.vimeo_download_1080p || selectedAsset.vimeo_download_720p || selectedAsset.vimeo_download_480p || selectedAsset.vimeo_download_360p;
                          return !hasFormats && !hasLegacy;
                        })() && (
                          <p className="text-sm text-gray-500 italic">
                            No download URLs configured. Click "Edit URLs" to add download links.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                ) : selectedAsset.current_version?.downloadPath ? (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (!accessToken) return;
                      const downloadUrl = ensureTokenUrl(selectedAsset.current_version!.downloadPath!);
                      const filename = `${selectedAsset.title || 'asset'}.${selectedAsset.current_version!.mime_type?.split('/')[1] || 'bin'}`;
                      await triggerDownload(
                        downloadUrl,
                        filename,
                        selectedAsset.id,
                        'api',
                        accessToken
                      );
                    }}
                    className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition shadow-sm"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </button>
                ) : (
                  <p className="text-sm text-gray-500">No download available</p>
                )}
              </div>

                {/* Metadata Section */}
              <div className="space-y-4">
                <div className="pb-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Details</h3>
                    <dl className="space-y-2 text-sm">
                      {selectedAsset.sku && (
                        <div>
                          <dt className="font-medium text-gray-700 mb-1">SKU</dt>
                          <dd className="text-gray-600">{selectedAsset.sku}</dd>
                        </div>
                      )}
                      {selectedAsset.product_line && (
                        <div>
                          <dt className="font-medium text-gray-700 mb-1">Product Line</dt>
                          <dd className="text-gray-600">{selectedAsset.product_line}</dd>
                        </div>
                      )}
                      {selectedAsset.product_name && (
                        <div>
                          <dt className="font-medium text-gray-700 mb-1">Product</dt>
                          <dd className="text-gray-600">{selectedAsset.product_name}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="font-medium text-gray-700 mb-1">Created</dt>
                        <dd className="text-gray-600">{new Date(selectedAsset.created_at).toLocaleDateString()}</dd>
                      </div>
                      {selectedAsset.current_version && (
                        <>
                          <div>
                            <dt className="font-medium text-gray-700 mb-1">Size</dt>
                            <dd className="text-gray-600">{formatBytes(selectedAsset.current_version.file_size) || '—'}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-700 mb-1">File Type</dt>
                            <dd className="text-gray-600">{selectedAsset.current_version.mime_type || 'Unknown'}</dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </div>

                  {selectedAsset.tags.length > 0 && (
                    <div className="pb-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Tags</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedAsset.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAsset.locales.length > 0 && (
                    <div className="pb-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Locales</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedAsset.locales.map((locale) => (
                          <span key={locale.code} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                            {locale.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedAsset.regions.length > 0 && (
                    <div className="pb-4 border-b border-gray-100">
                      <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Regions</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedAsset.regions.map((region) => (
                          <span key={region.code} className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                            {region.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Versions Section */}
                <div className="pt-4 pb-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Versions</h3>
                  {loadingVersions ? (
                    <div className="text-sm text-gray-500 py-4">Loading versions...</div>
                  ) : assetVersions.length === 0 ? (
                    <div className="text-sm text-gray-500 py-4">No versions found</div>
                  ) : (
                    <div className="space-y-2">
                      {assetVersions.map((version) => (
                        <div
                          key={version.id}
                          className={`flex items-center justify-between rounded-md border p-2.5 transition ${
                            version.id === selectedAsset.current_version?.id
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 bg-white hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="font-medium text-gray-900">v{version.version_number}</span>
                            <span className="text-xs text-gray-500 truncate">
                              {formatBytes(version.file_size) || '—'} • {version.mime_type?.split('/')[1] || 'Unknown'}
                            </span>
                            {version.id === selectedAsset.current_version?.id && (
                              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white whitespace-nowrap">
                                Current
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {version.previewPath && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(ensureTokenUrl(version.previewPath), '_blank');
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Preview
                              </button>
                            )}
                            {version.downloadPath && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!accessToken) return;
                                  const downloadUrl = ensureTokenUrl(version.downloadPath);
                                  const filename = `${selectedAsset.title || 'asset'}-v${version.version_number}.${version.mime_type?.split('/')[1] || 'bin'}`;
                                  await triggerDownload(
                                    downloadUrl,
                                    filename,
                                    selectedAsset.id,
                                    'api',
                                    accessToken
                                  );
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                Download
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
                  {selectedAsset.current_version?.downloadPath && (
                    <button
                      type="button"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!accessToken) return;
                        const downloadUrl = ensureTokenUrl(selectedAsset.current_version!.downloadPath!);
                        const filename = `${selectedAsset.title || 'asset'}.${selectedAsset.current_version!.mime_type?.split('/')[1] || 'bin'}`;
                        await triggerDownload(
                          downloadUrl,
                          filename,
                          selectedAsset.id,
                          'api',
                          accessToken
                        );
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition shadow-sm"
                    >
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Download Asset
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteAsset(selectedAsset.id);
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Delete Asset
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
