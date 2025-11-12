'use client';

import { useEffect, useMemo, useState } from 'react';
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
} from '@heroicons/react/24/outline';

const assetTypeOptions: Array<{ value: string; label: string; icon: JSX.Element }> = [
  { value: 'image', label: 'Image', icon: <PhotoIcon className="h-4 w-4" /> },
  { value: 'video', label: 'Video', icon: <FilmIcon className="h-4 w-4" /> },
  { value: 'document', label: 'Document', icon: <DocumentTextIcon className="h-4 w-4" /> },
  { value: 'audio', label: 'Audio', icon: <MusicalNoteIcon className="h-4 w-4" /> },
  { value: 'archive', label: 'Archive', icon: <Squares2X2Icon className="h-4 w-4" /> },
  { value: 'other', label: 'Other', icon: <Squares2X2Icon className="h-4 w-4" /> },
];

interface TagOption {
  id: string;
  slug: string;
  label: string;
}

interface AudienceOption {
  id: string;
  code: string;
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
  downloadPath?: string | null;
  previewPath?: string | null;
}

interface AssetRecord {
  id: string;
  title: string;
  description?: string | null;
  asset_type: string;
  product_line?: string | null;
  sku?: string | null;
  created_at: string;
  current_version?: AssetVersion | null;
  tags: string[];
  audiences: string[];
  locales: LocaleOption[];
  regions: RegionOption[];
}

interface UploadFormState {
  title: string;
  description: string;
  assetType: string;
  productLine: string;
  sku: string;
  selectedTagSlugs: string[];
  selectedAudienceCodes: string[];
  selectedLocaleCodes: string[];
  primaryLocale: string | null;
  selectedRegionCodes: string[];
  file: File | null;
}

const defaultFormState: UploadFormState = {
  title: '',
  description: '',
  assetType: 'image',
  productLine: '',
  sku: '',
  selectedTagSlugs: [],
  selectedAudienceCodes: [],
  selectedLocaleCodes: [],
  primaryLocale: null,
  selectedRegionCodes: [],
  file: null,
};

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

export default function AdminDigitalAssetManagerPage() {
  const { session, supabase } = useSupabase();
  const [accessToken, setAccessToken] = useState<string | null>(session?.access_token ?? null);
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [error, setError] = useState<string>('');

  const [tags, setTags] = useState<TagOption[]>([]);
  const [audiences, setAudiences] = useState<AudienceOption[]>([]);
  const [locales, setLocales] = useState<LocaleOption[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);

  const [formState, setFormState] = useState<UploadFormState>(defaultFormState);
  const [uploading, setUploading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [newTagLabel, setNewTagLabel] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [localeFilter, setLocaleFilter] = useState<string>('');

  useEffect(() => {
    let active = true;
    if (!accessToken) {
      supabase.auth.getSession().then(({ data }) => {
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
  }, [accessToken]);

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
      setAudiences(payload.audiences || []);
      setLocales(localeOptions);
      setRegions(payload.regions || []);

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

  const fetchAssets = async (token: string) => {
    try {
      setLoadingAssets(true);
      setError('');

      const headers = buildAuthHeaders(token);
      const response = await fetch('/api/dam/assets', {
        method: 'GET',
        headers: Object.keys(headers).length ? headers : undefined,
        credentials: 'same-origin',
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load assets');
      }

      const payload = await response.json();
      setAssets(payload.assets || []);
    } catch (err: any) {
      console.error('Failed to load assets', err);
      setError(err.message || 'Failed to load assets');
    } finally {
      setLoadingAssets(false);
    }
  };

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const matchesType = typeFilter ? asset.asset_type === typeFilter : true;
      const matchesLocale = localeFilter
        ? asset.locales.some((locale) => locale.code === localeFilter)
        : true;
      const matchesSearch = searchTerm
        ? [asset.title, asset.product_line, asset.sku]
            .filter(Boolean)
            .some((value) => value!.toLowerCase().includes(searchTerm.toLowerCase()))
        : true;
      return matchesType && matchesLocale && matchesSearch;
    });
  }, [assets, searchTerm, typeFilter, localeFilter]);

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
    });
    setSuccessMessage('');
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccessMessage('');

    if (!formState.file) {
      setError('Please select a file to upload.');
      return;
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

    setUploading(true);
    try {
      const payload = {
        title: formState.title.trim(),
        description: formState.description.trim() || undefined,
        assetType: formState.assetType,
        productLine: formState.productLine.trim() || undefined,
        sku: formState.sku.trim() || undefined,
        tags: formState.selectedTagSlugs,
        audiences: formState.selectedAudienceCodes,
        locales: formState.selectedLocaleCodes.map((code) => ({
          code,
          primary: code === formState.primaryLocale,
        })),
        regions: formState.selectedRegionCodes,
      };

      const formData = new FormData();
      formData.append('payload', JSON.stringify(payload));
      formData.append('file', formState.file);

      if (!accessToken) return;
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

      setSuccessMessage('Asset uploaded successfully. Processing may take a few moments.');
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
          onClick={() => fetchAssets(accessToken ?? '')}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700">Asset Type</label>
                <select
                  value={formState.assetType}
                  onChange={(event) => setFormState((prev) => ({ ...prev, assetType: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                >
                  {assetTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
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
              <label className="block text-sm font-medium text-gray-700">Product Line</label>
              <input
                type="text"
                value={formState.productLine}
                onChange={(event) => setFormState((prev) => ({ ...prev, productLine: event.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
                placeholder="Optional"
              />
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
              <label className="block text-sm font-medium text-gray-700">Audiences</label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {audiences.map((audience) => {
                  const selected = formState.selectedAudienceCodes.includes(audience.code);
                  return (
                    <label key={audience.code} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() =>
                          setFormState((prev) => ({
                            ...prev,
                            selectedAudienceCodes: toggleSelection(prev.selectedAudienceCodes, audience.code),
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-black focus:ring-black"
                      />
                      <span>{audience.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Locales *</label>
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
              <label className="block text-sm font-medium text-gray-700">Regions (optional)</label>
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

            <div>
              <label className="block text-sm font-medium text-gray-700">File *</label>
              <input
                type="file"
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, file: event.target.files ? event.target.files[0] : null }))
                }
                className="mt-1 block w-full text-sm text-gray-700 file:mr-4 file:rounded-md file:border file:border-gray-200 file:bg-white file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:border-gray-400"
                required
              />
              {formState.file && (
                <p className="mt-2 text-xs text-gray-500">
                  {formState.file.name} • {formatBytes(formState.file.size)}
                </p>
              )}
            </div>

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
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
                <option value="">All types</option>
                {assetTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
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
            </div>
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filteredAssets.map((asset) => (
                <div key={asset.id} className="flex gap-4 rounded-xl border border-gray-200 p-4">
                  <div className="relative h-24 w-24 flex-shrink-0 overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {asset.current_version?.previewPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={asset.current_version.previewPath}
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
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-gray-900">{asset.title}</h4>
                        {renderAssetTypePill(asset.asset_type)}
                      </div>
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
                          <span>Status: {asset.current_version.processing_status}</span>
                          <span>Size: {formatBytes(asset.current_version.file_size)}</span>
                          <span>{asset.current_version.mime_type || 'Unknown type'}</span>
                        </div>
                      )}
                      {asset.tags.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">Tags:</span> {asset.tags.join(', ')}
                        </div>
                      )}
                      {asset.audiences.length > 0 && (
                        <div>
                          <span className="font-medium text-gray-700">Audiences:</span> {asset.audiences.join(', ')}
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
                            href={asset.current_version.downloadPath}
                            className="font-medium text-gray-700 underline-offset-2 hover:underline"
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
          )}
        </Card>
      </div>
    </div>
  );
}
