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
  vimeo_download_1080p?: string | null;
  vimeo_download_720p?: string | null;
  vimeo_download_480p?: string | null;
  vimeo_download_360p?: string | null;
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
  vimeoVideoId: string; // Vimeo video ID or URL
  vimeoDownload1080p: string;
  vimeoDownload720p: string;
  vimeoDownload480p: string;
  vimeoDownload360p: string;
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
  vimeoDownload1080p: '',
  vimeoDownload720p: '',
  vimeoDownload480p: '',
  vimeoDownload360p: '',
};

// Product name options (static list)
const PRODUCT_NAME_OPTIONS = [
  'Hair Controller',
  'Curl Controller',
  'Volume Controller',
  'Texture Controller',
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
  const [editingDownloadUrls, setEditingDownloadUrls] = useState({
    vimeo_download_1080p: '',
    vimeo_download_720p: '',
    vimeo_download_480p: '',
    vimeo_download_360p: '',
  });
  const [savingUrls, setSavingUrls] = useState(false);

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
      vimeoDownload1080p: '',
      vimeoDownload720p: '',
      vimeoDownload480p: '',
      vimeoDownload360p: '',
    });
    setSuccessMessage('');
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
          vimeoDownload1080p: formState.vimeoDownload1080p.trim() || undefined,
          vimeoDownload720p: formState.vimeoDownload720p.trim() || undefined,
          vimeoDownload480p: formState.vimeoDownload480p.trim() || undefined,
          vimeoDownload360p: formState.vimeoDownload360p.trim() || undefined,
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

  const renderAssetTypePill = (assetType: string) => {
    const option = assetTypeOptions.find((opt) => opt.value === assetType);
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">
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

  const validateFileType = (file: File, assetType: string): boolean => {
    const fileName = file.name.toLowerCase();
    const mimeType = file.type.toLowerCase();

    switch (assetType) {
      case 'image':
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

  return (
    <div className="mt-8 mb-4 space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">Digital Asset Manager</h2>
          <p className="text-sm text-gray-600">
            Upload and manage marketing and product collateral available to distributors and pros.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCurrentPage(1);
            fetchAssets(accessToken ?? '', undefined, 1);
          }}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Active Uploads Section */}
      {activeUploads.length > 0 && (
        <Card className="mb-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Active Uploads</h3>
          <div className="space-y-3">
            {activeUploads.map((upload) => (
              <div key={upload.id} className="rounded-lg border border-gray-200 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{upload.fileName}</p>
                    <p className="text-xs text-gray-500">
                      {formatBytes(upload.fileSize)} •{' '}
                      {upload.status === 'uploading'
                        ? 'Uploading...'
                        : upload.status === 'completing'
                        ? 'Finalizing...'
                        : upload.status === 'success'
                        ? 'Complete'
                        : 'Error'}
                    </p>
                  </div>
                  {upload.status === 'error' && upload.error && (
                    <span className="ml-4 text-xs text-red-600">{upload.error}</span>
                  )}
                  {upload.status === 'success' && (
                    <span className="ml-4 text-xs text-green-600">✓ Success</span>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
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
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>{upload.progress}%</span>
                  <span>
                    {upload.status === 'uploading' || upload.status === 'completing'
                      ? `${formatBytes((upload.progress / 100) * upload.fileSize)} of ${formatBytes(upload.fileSize)}`
                      : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Upload Asset</h3>
          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}
          <form className="space-y-4" onSubmit={handleUpload}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Title *</label>
              <input
                type="text"
                value={formState.title}
                onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formState.description}
                onChange={(event) => setFormState((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              />
            </div>

            {/* Asset Taxonomy Section */}
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">Asset Taxonomy</h4>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Asset Type *</label>
                  <select
                    value={formState.assetTypeId || ''}
                    onChange={(event) => {
                      const selectedTypeId = event.target.value || null;
                      // Clear subtype when type changes
                      setFormState((prev) => ({ 
                        ...prev, 
                        assetTypeId: selectedTypeId,
                        assetSubtypeId: null,
                        // Sync legacy assetType enum for backwards compatibility
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
                        file: null // Clear file when type changes
                      }));
                    }}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    required
                  >
                    <option value="">Select Asset Type</option>
                    {assetTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                  {/* Help text for Image vs Artwork */}
                  {(() => {
                    const selectedType = assetTypes.find(t => t.id === formState.assetTypeId);
                    if (selectedType?.slug === 'image') {
                      return (
                        <p className="mt-1 text-xs text-blue-600">
                          <strong>Image:</strong> Finished, exported, flattened visuals (JPG/PNG/WebP). Ready-to-use by distributors, no layers.
                        </p>
                      );
                    }
                    if (selectedType?.slug === 'artwork') {
                      return (
                        <p className="mt-1 text-xs text-purple-600">
                          <strong>Artwork:</strong> Editable, layered, template or master design files (PSD/AI/EPS/SVG/INDD/CMYK PDFs). For designers.
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">
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
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
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

            {/* Product Information Section */}
            <div className="space-y-4 border-t border-gray-200 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">Product Information</h4>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Product Line</label>
                  <select
                    value={formState.productLine}
                    onChange={(event) => setFormState((prev) => ({ ...prev, productLine: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                  >
                    <option value="">None</option>
                    <option value="ProCtrl">ProCtrl</option>
                    <option value="SelfCtrl">SelfCtrl</option>
                    <option value="Both">Both</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Product Name</label>
                  <select
                    value={formState.productName}
                    onChange={(event) => setFormState((prev) => ({ ...prev, productName: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
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

              <div>
                <label className="block text-sm font-medium text-gray-700">SKU</label>
                <input
                  type="text"
                  value={formState.sku}
                  onChange={(event) => setFormState((prev) => ({ ...prev, sku: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Tags</label>
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap gap-2">
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
                        className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
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
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newTagLabel}
                    onChange={(event) => setNewTagLabel(event.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                    placeholder="Add new tag"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>


            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Locales *</label>
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
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  + Add Language
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {locales.map((locale) => {
                  const selected = formState.selectedLocaleCodes.includes(locale.code);
                  return (
                    <div key={locale.code} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleLocaleToggle(locale.code)}
                          className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                        />
                        <span>{locale.label}</span>
                      </label>
                      {selected && (
                        <label className="flex items-center gap-1 text-xs text-gray-600">
                          <input
                            type="radio"
                            name="primary-locale"
                            checked={formState.primaryLocale === locale.code}
                            onChange={() => handlePrimaryLocaleChange(locale.code)}
                          />
                          Primary
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Regions (optional)
                <span className="ml-2 text-xs font-normal text-gray-500">Filter assets by geographic region</span>
              </label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {regions.map((region) => {
                  const selected = formState.selectedRegionCodes.includes(region.code);
                  return (
                    <label key={region.code} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setFormState((prev) => ({
                            ...prev,
                            selectedRegionCodes: toggleSelection(prev.selectedRegionCodes, region.code),
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                      />
                      <span>{region.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Contextual Fields Based on Asset Type */}
            {(() => {
              const selectedAssetType = assetTypes.find(t => t.id === formState.assetTypeId);
              const isVideoType = selectedAssetType?.slug === 'video';
              const isRegulatoryType = selectedAssetType?.slug === 'packaging-regulatory';
              
              if (isVideoType) {
                return (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Vimeo Video ID or URL *</label>
                      <input
                        type="text"
                        value={formState.vimeoVideoId}
                        onChange={(event) => setFormState((prev) => ({ ...prev, vimeoVideoId: event.target.value }))}
                        className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                        placeholder="e.g., 123456789 or https://vimeo.com/123456789"
                        required
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Upload your video to Vimeo first, then paste the video ID or URL here.
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Download URLs (Optional)</label>
                      <p className="text-xs text-gray-500 mb-3">
                        Paste direct MP4 download URLs for different quality levels. These will be stored as-is.
                      </p>
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">1080p</label>
                          <input
                            type="text"
                            value={formState.vimeoDownload1080p}
                            onChange={(event) => setFormState((prev) => ({ ...prev, vimeoDownload1080p: event.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">720p</label>
                          <input
                            type="text"
                            value={formState.vimeoDownload720p}
                            onChange={(event) => setFormState((prev) => ({ ...prev, vimeoDownload720p: event.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">480p</label>
                          <input
                            type="text"
                            value={formState.vimeoDownload480p}
                            onChange={(event) => setFormState((prev) => ({ ...prev, vimeoDownload480p: event.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                            placeholder="https://..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">360p</label>
                          <input
                            type="text"
                            value={formState.vimeoDownload360p}
                            onChange={(event) => setFormState((prev) => ({ ...prev, vimeoDownload360p: event.target.value }))}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                            placeholder="https://..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              }
              
              // For non-video types, show file upload
              return (
                <div>
                  <label className="block text-sm font-medium text-gray-700">File *</label>
                  <input
                    type="file"
                    accept={getAcceptAttribute(formState.assetType, formState.assetTypeId)}
                    onChange={(event) => {
                      const file = event.target.files ? event.target.files[0] : null;
                      if (file) {
                        // Additional validation: check if file type matches the selected asset type
                        const isValid = validateFileType(file, formState.assetType, formState.assetTypeId);
                        if (!isValid) {
                          const selectedType = assetTypes.find(t => t.id === formState.assetTypeId);
                          const typeName = selectedType?.name || formState.assetType;
                          alert(`Invalid file type. Please select a ${typeName} file.`);
                          event.target.value = ''; // Clear the input
                          return;
                        }
                        // Additional warning for Image vs Artwork confusion
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
                    className="mt-1 block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:border-gray-400"
                    required={!isVideoType}
                  />
                  {formState.file && (
                    <p className="mt-2 text-xs text-gray-500">
                      {formState.file.name} • {formatBytes(formState.file.size)}
                    </p>
                  )}
                  {isRegulatoryType && (
                    <p className="mt-2 text-xs text-amber-600">
                      ⚠ For regulatory assets, Product selection is recommended.
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={uploading}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-black px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <ArrowUpTrayIcon className="h-4 w-4" />
                {uploading ? 'Uploading…' : 'Upload Asset'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Reset
              </button>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Asset Library</h3>
              <p className="text-sm text-gray-600">Search, filter, and review uploaded assets.</p>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:flex-wrap">
              <input
                type="search"
                placeholder="Search by title, product line, or SKU"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none lg:w-64"
              />
              <select
                value={typeFilter}
                onChange={(event) => setTypeFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All types (legacy)</option>
                {assetTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <select
                value={assetTypeFilter}
                onChange={(event) => {
                  setAssetTypeFilter(event.target.value);
                  setAssetSubtypeFilter(''); // Clear subtype when type changes
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All Asset Types</option>
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
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">All Sub-Types</option>
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
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All product lines</option>
                <option value="ProCtrl">ProCtrl</option>
                <option value="SelfCtrl">SelfCtrl</option>
                <option value="Both">Both</option>
                <option value="None">None</option>
                {productLines.filter(pl => !['ProCtrl', 'SelfCtrl', 'Both', 'None'].includes(pl)).map((pl) => (
                  <option key={pl} value={pl}>
                    {pl}
                  </option>
                ))}
              </select>
              <select
                value={productNameFilter}
                onChange={(event) => setProductNameFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All products</option>
                {PRODUCT_NAME_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <select
                value={localeFilter}
                onChange={(event) => setLocaleFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All locales</option>
                {locales.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.label}
                  </option>
                ))}
              </select>
              <select
                value={regionFilter}
                onChange={(event) => setRegionFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All regions</option>
                {regions.map((region) => (
                  <option key={region.code} value={region.code}>
                    {region.label}
                  </option>
                ))}
              </select>
              <select
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              >
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag.slug} value={tag.label}>
                    {tag.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          {/* Advanced Search Accordion */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50">
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
              <div className="px-4 pb-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
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

          {loadingAssets ? (
            <div className="flex items-center justify-center py-12 text-gray-600">
              <div className="flex items-center gap-3 text-sm">
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Loading assets…
              </div>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-6 py-12 text-center text-sm text-gray-600">
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
              
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Select All Checkbox */}
                <div className="md:col-span-2 flex items-center gap-2 px-2 py-2 border-b border-gray-200">
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
                
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex gap-4 rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-gray-300 transition relative"
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
                      className="absolute top-4 left-4 z-10 flex h-5 w-5 items-center justify-center rounded border-2 bg-white shadow-sm hover:bg-gray-50"
                    >
                      {selectedAssetIds.has(asset.id) && (
                        <CheckIcon className="h-3 w-3 text-blue-600" />
                      )}
                    </button>
                    {selectedAssetIds.has(asset.id) && (
                      <div className="absolute inset-0 rounded-xl border-2 border-blue-600 bg-blue-50/20 pointer-events-none" />
                    )}
                    <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                      // Vimeo video - show Vimeo poster/thumbnail (using oEmbed API for poster image)
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://vumbnail.com/${asset.vimeo_video_id}.jpg`}
                        alt={asset.title}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          // Fallback to Vimeo's default thumbnail URL pattern
                          (e.target as HTMLImageElement).src = `https://i.vimeocdn.com/video/${asset.vimeo_video_id}_640.jpg`;
                        }}
                      />
                    ) : accessToken && asset.current_version?.previewPath ? (
                      // Other assets - show preview/thumbnail
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={ensureTokenUrl(asset.current_version.previewPath)}
                        alt={asset.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-400">
                        <PhotoIcon className="h-8 w-8" />
                      </div>
                    )}
                    {asset.current_version && (
                      <span className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] font-medium text-gray-700">
                        v{asset.current_version.version_number}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-semibold text-gray-900">{asset.title}</h4>
                          {renderAssetTypePill(asset.asset_type)}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteAsset(asset.id);
                          }}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="Delete asset"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                      {selectedAssetIds.has(asset.id) && (
                        <div className="absolute inset-0 rounded-xl border-2 border-blue-600 bg-blue-50/20 pointer-events-none" />
                      )}
                      {asset.description && (
                        <p className="text-xs text-gray-600 line-clamp-2">{asset.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        <span>Created {new Date(asset.created_at).toLocaleDateString()}</span>
                        {asset.sku && <span>SKU {asset.sku}</span>}
                        {asset.product_line && <span>{asset.product_line}</span>}
                      </div>
                    </div>
                    <div className="space-y-1 text-xs text-gray-600">
                      {asset.current_version && (
                        <div className="flex items-center gap-3">
                          <span>Size: {formatBytes(asset.current_version.file_size) || '—'}</span>
                          <span>{asset.current_version.mime_type || 'Unknown type'}</span>
                          {asset.asset_type === 'video' && asset.vimeo_video_id && (
                            <span>Vimeo ID: {asset.vimeo_video_id}</span>
                          )}
                        </div>
                      )}
                      {asset.tags.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">Tags:</span> {asset.tags.join(', ')}
                        </div>
                      )}
                      {asset.locales.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">Locales:</span>{' '}
                          {asset.locales.map((locale) => locale.label).join(', ')}
                        </div>
                      )}
                      {asset.regions.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">Regions:</span> {asset.regions.map((region) => region.label).join(', ')}
                        </div>
                      )}
                      {asset.current_version?.downloadPath && (
                        <div>
                          <a
                            href={ensureTokenUrl(asset.current_version.downloadPath)}
                            className="font-medium text-gray-700 underline-offset-2 hover:underline"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!accessToken) {
                                e.preventDefault();
                                return;
                              }
                              await logDownload(
                                asset.id,
                                asset.current_version!.downloadPath!,
                                'api',
                                accessToken
                              );
                            }}
                          >
                            Download
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
          
          {/* Pagination Controls */}
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
        </Card>
      </div>

      {/* Asset Detail Modal */}
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
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-white rounded-lg shadow-xl">
            {/* Close button */}
            <button
              type="button"
              onClick={() => {
                setSelectedAsset(null);
                setIsEditingAsset(false);
                setAssetVersions([]);
              }}
              className="absolute top-4 right-4 z-10 rounded-full bg-white/90 p-2 text-gray-600 hover:bg-white hover:text-gray-900 transition"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div className="p-6">
              {/* Header */}
              <div className="mb-6">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-semibold text-gray-900">{selectedAsset.title || 'Untitled Asset'}</h2>
                  {renderAssetTypePill(selectedAsset.asset_type)}
                </div>
                {selectedAsset.description && (
                  <p className="text-gray-600">{selectedAsset.description}</p>
                )}
              </div>

              {/* Vimeo Player (for videos) */}
              {selectedAsset.asset_type === 'video' && selectedAsset.vimeo_video_id ? (
                <div className="mb-6">
                  <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                    <iframe
                      src={`https://player.vimeo.com/video/${selectedAsset.vimeo_video_id}?byline=0&title=0&portrait=0`}
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      className="absolute inset-0 w-full h-full border-0 rounded-lg"
                      title={selectedAsset.title || 'Video'}
                    />
                  </div>
                </div>
              ) : null}

              {/* Preview for non-video assets */}
              {selectedAsset.asset_type !== 'video' && selectedAsset.current_version?.previewPath && accessToken && (
                <div className="mb-6">
                  <div className="relative w-full bg-gray-100 rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                    <img
                      src={ensureTokenUrl(selectedAsset.current_version.previewPath)}
                      alt={selectedAsset.title}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Download Section */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Downloads</h3>
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
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Download URL (1080p)
                          </label>
                          <input
                            type="text"
                            value={editingDownloadUrls.vimeo_download_1080p}
                            onChange={(e) => setEditingDownloadUrls(prev => ({ ...prev, vimeo_download_1080p: e.target.value }))}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Download URL (720p)
                          </label>
                          <input
                            type="text"
                            value={editingDownloadUrls.vimeo_download_720p}
                            onChange={(e) => setEditingDownloadUrls(prev => ({ ...prev, vimeo_download_720p: e.target.value }))}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Download URL (480p)
                          </label>
                          <input
                            type="text"
                            value={editingDownloadUrls.vimeo_download_480p}
                            onChange={(e) => setEditingDownloadUrls(prev => ({ ...prev, vimeo_download_480p: e.target.value }))}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Download URL (360p)
                          </label>
                          <input
                            type="text"
                            value={editingDownloadUrls.vimeo_download_360p}
                            onChange={(e) => setEditingDownloadUrls(prev => ({ ...prev, vimeo_download_360p: e.target.value }))}
                            placeholder="https://..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                          />
                        </div>
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
                                  vimeo_download_1080p: editingDownloadUrls.vimeo_download_1080p.trim() || null,
                                  vimeo_download_720p: editingDownloadUrls.vimeo_download_720p.trim() || null,
                                  vimeo_download_480p: editingDownloadUrls.vimeo_download_480p.trim() || null,
                                  vimeo_download_360p: editingDownloadUrls.vimeo_download_360p.trim() || null,
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
                        {[
                          { quality: '1080p', url: selectedAsset.vimeo_download_1080p || null },
                          { quality: '720p', url: selectedAsset.vimeo_download_720p || null },
                          { quality: '480p', url: selectedAsset.vimeo_download_480p || null },
                          { quality: '360p', url: selectedAsset.vimeo_download_360p || null },
                        ]
                          .filter((item) => item.url && typeof item.url === 'string' && item.url.trim() !== '')
                          .map((item) => (
                            <button
                              key={item.quality}
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                const filename = `${selectedAsset.title || 'video'}-${item.quality}.mp4`;
                                await triggerDownload(
                                  item.url!,
                                  filename,
                                  selectedAsset.id,
                                  `video-${item.quality}`,
                                  accessToken
                                );
                              }}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition mr-2"
                            >
                              <ArrowDownTrayIcon className="h-4 w-4" />
                              Download {item.quality}
                            </button>
                          ))}
                        
                        {/* Show message if no download URLs configured */}
                        {(!selectedAsset.vimeo_download_1080p || (typeof selectedAsset.vimeo_download_1080p === 'string' && selectedAsset.vimeo_download_1080p.trim() === '')) && 
                         (!selectedAsset.vimeo_download_720p || (typeof selectedAsset.vimeo_download_720p === 'string' && selectedAsset.vimeo_download_720p.trim() === '')) && 
                         (!selectedAsset.vimeo_download_480p || (typeof selectedAsset.vimeo_download_480p === 'string' && selectedAsset.vimeo_download_480p.trim() === '')) && 
                         (!selectedAsset.vimeo_download_360p || (typeof selectedAsset.vimeo_download_360p === 'string' && selectedAsset.vimeo_download_360p.trim() === '')) && (
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
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    <ArrowDownTrayIcon className="h-4 w-4" />
                    Download
                  </button>
                ) : (
                  <p className="text-sm text-gray-500">No download available</p>
                )}
              </div>

              {/* Metadata */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Details</h3>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {selectedAsset.sku && (
                    <>
                      <dt className="font-medium text-gray-700">SKU</dt>
                      <dd className="text-gray-600">{selectedAsset.sku}</dd>
                    </>
                  )}
                  {selectedAsset.product_line && (
                    <>
                      <dt className="font-medium text-gray-700">Product Line</dt>
                      <dd className="text-gray-600">{selectedAsset.product_line}</dd>
                    </>
                  )}
                  <dt className="font-medium text-gray-700">Created</dt>
                  <dd className="text-gray-600">{new Date(selectedAsset.created_at).toLocaleDateString()}</dd>
                  {selectedAsset.current_version && (
                    <>
                      <dt className="font-medium text-gray-700">Size</dt>
                      <dd className="text-gray-600">{formatBytes(selectedAsset.current_version.file_size) || '—'}</dd>
                      <dt className="font-medium text-gray-700">Type</dt>
                      <dd className="text-gray-600">{selectedAsset.current_version.mime_type || 'Unknown'}</dd>
                    </>
                  )}
                </dl>

                {selectedAsset.tags.length > 0 && (
                  <div className="mt-4">
                    <dt className="font-medium text-gray-700 mb-2">Tags</dt>
                    <dd className="flex flex-wrap gap-2">
                      {selectedAsset.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                          {tag}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}


                {selectedAsset.locales.length > 0 && (
                  <div className="mt-4">
                    <dt className="font-medium text-gray-700 mb-2">Locales</dt>
                    <dd className="text-gray-600">{selectedAsset.locales.map((l) => l.label).join(', ')}</dd>
                  </div>
                )}

                {selectedAsset.regions.length > 0 && (
                  <div className="mt-4">
                    <dt className="font-medium text-gray-700 mb-2">Regions</dt>
                    <dd className="text-gray-600">{selectedAsset.regions.map((r) => r.label).join(', ')}</dd>
                  </div>
                )}
              </div>

              {/* Versions Section */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Versions</h3>
                {loadingVersions ? (
                  <div className="text-sm text-gray-500">Loading versions...</div>
                ) : assetVersions.length === 0 ? (
                  <div className="text-sm text-gray-500">No versions found</div>
                ) : (
                  <div className="space-y-2">
                    {assetVersions.map((version) => (
                      <div
                        key={version.id}
                        className={`flex items-center justify-between rounded-lg border p-3 ${
                          version.id === selectedAsset.current_version?.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">v{version.version_number}</span>
                          <span className="text-sm text-gray-600">
                            {new Date(version.created_at).toLocaleDateString()}
                          </span>
                          <span className="text-sm text-gray-500">
                            {formatBytes(version.file_size) || '—'} • {version.mime_type || 'Unknown'}
                          </span>
                          {version.id === selectedAsset.current_version?.id && (
                            <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-medium text-white">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {version.previewPath && (
                            <a
                              href={ensureTokenUrl(version.previewPath)}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Just open in new tab, don't trigger download
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              Preview
                            </a>
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
                              className="text-sm text-blue-600 hover:text-blue-800"
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
