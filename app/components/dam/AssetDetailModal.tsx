'use client';

import { XMarkIcon, PhotoIcon, EyeIcon, ArrowDownTrayIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { AssetRecord, VimeoDownloadFormat } from './types';
import { formatBytes, ensureTokenUrl, getFriendlyFileType } from './utils';

interface AssetDetailModalProps {
  asset: AssetRecord;
  accessToken: string | null;
  onClose: () => void;
  // Download handling
  onDownload?: (asset: AssetRecord, format?: string) => Promise<void>;
  downloadingFormats?: Set<string>;
  // Admin-only features
  isAdmin?: boolean;
  onEdit?: (asset: AssetRecord) => void;
  onDelete?: (assetId: string) => void;
  // Video download URL editing (admin only)
  isEditingVideoUrls?: boolean;
  editingDownloadUrls?: VimeoDownloadFormat[];
  onToggleEditVideoUrls?: () => void;
  onUpdateVideoUrls?: (formats: VimeoDownloadFormat[]) => Promise<void>;
  onVideoUrlChange?: (index: number, field: 'resolution' | 'url', value: string) => void;
  onAddVideoFormat?: () => void;
  onRemoveVideoFormat?: (index: number) => void;
  savingUrls?: boolean;
  resolutionOptions?: string[];
  // Rendering helpers
  renderAssetTypePill?: (type: string) => JSX.Element | null;
}

const DEFAULT_RESOLUTION_OPTIONS = ['4K', '2K', '1080p', '720p', '540p', '480p', '360p', '240p', 'Other'];

export default function AssetDetailModal({
  asset,
  accessToken,
  onClose,
  onDownload,
  downloadingFormats = new Set(),
  isAdmin = false,
  onEdit,
  onDelete,
  isEditingVideoUrls = false,
  editingDownloadUrls = [],
  onToggleEditVideoUrls,
  onUpdateVideoUrls,
  onVideoUrlChange,
  onAddVideoFormat,
  onRemoveVideoFormat,
  savingUrls = false,
  resolutionOptions = DEFAULT_RESOLUTION_OPTIONS,
  renderAssetTypePill,
}: AssetDetailModalProps) {
  const getValidVideoFormats = (): VimeoDownloadFormat[] => {
    const formats: VimeoDownloadFormat[] = [];
    
    // Use dynamic formats if available
    if (asset.vimeo_download_formats && asset.vimeo_download_formats.length > 0) {
      formats.push(...asset.vimeo_download_formats.filter(f => f.url && f.url.trim() !== ''));
    } else {
      // Fall back to legacy fields
      if (asset.vimeo_download_1080p) formats.push({ resolution: '1080p', url: asset.vimeo_download_1080p });
      if (asset.vimeo_download_720p) formats.push({ resolution: '720p', url: asset.vimeo_download_720p });
      if (asset.vimeo_download_480p) formats.push({ resolution: '480p', url: asset.vimeo_download_480p });
      if (asset.vimeo_download_360p) formats.push({ resolution: '360p', url: asset.vimeo_download_360p });
    }
    
    return formats;
  };

  const validFormats = getValidVideoFormats();
  const assetDownloadKey = `asset-action-${asset.id}`;
  const isDownloadingAsset = downloadingFormats.has(assetDownloadKey);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-6xl max-h-[90vh] bg-white rounded-lg shadow-xl overflow-hidden flex flex-col">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-20 rounded-md bg-white/90 p-1.5 text-gray-600 hover:bg-white hover:text-gray-900 transition shadow-sm"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>

        {/* Two Column Layout */}
        <div className="flex flex-col lg:flex-row h-full overflow-hidden">
          {/* Left Column - Preview */}
          <div className="lg:w-[55%] bg-gray-50 flex items-center justify-center p-6 min-h-[400px]">
            {asset.asset_type === 'video' && asset.vimeo_video_id ? (
              <div className="w-full max-w-3xl">
                <div className="relative w-full rounded-md overflow-hidden shadow-md" style={{ aspectRatio: '16/9' }}>
                  <iframe
                    src={`https://player.vimeo.com/video/${asset.vimeo_video_id}?byline=0&title=0&portrait=0`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    className="absolute inset-0 w-full h-full border-0"
                    title={asset.title || 'Video'}
                  />
                </div>
              </div>
            ) : asset.current_version?.downloadPath && accessToken ? (
              <div className="w-full max-w-3xl">
                <img
                  src={ensureTokenUrl(asset.current_version.downloadPath, accessToken)}
                  alt={asset.title}
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
                <h2 className="text-lg font-semibold text-gray-900 flex-1">{asset.title || 'Untitled Asset'}</h2>
              </div>
              <div className="flex items-center gap-2 mb-2">
                {renderAssetTypePill && renderAssetTypePill(asset.asset_type)}
              </div>
              {asset.description && (
                <p className="text-sm text-gray-600 leading-relaxed">{asset.description}</p>
              )}
            </div>

            {/* Preview & Downloads Section */}
            <div className="mb-4 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Preview & Downloads</h3>
                {isAdmin && asset.asset_type === 'video' && asset.vimeo_video_id && onToggleEditVideoUrls && (
                  <button
                    type="button"
                    onClick={onToggleEditVideoUrls}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    {isEditingVideoUrls ? 'Cancel' : 'Edit Download URLs'}
                  </button>
                )}
              </div>

              {/* Video download formats */}
              {asset.asset_type === 'video' && asset.vimeo_video_id ? (
                <div className="space-y-4">
                  {isAdmin && isEditingVideoUrls && editingDownloadUrls && onVideoUrlChange && onAddVideoFormat && onRemoveVideoFormat && onUpdateVideoUrls ? (
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      {editingDownloadUrls.map((format, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <div className="flex-1">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Resolution</label>
                            <select
                              value={format.resolution}
                              onChange={(e) => onVideoUrlChange(index, 'resolution', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                            >
                              {resolutionOptions.map((res) => (
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
                              onChange={(e) => onVideoUrlChange(index, 'url', e.target.value)}
                              placeholder="https://..."
                              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveVideoFormat(index)}
                            className="mt-6 text-red-600 hover:text-red-700"
                            title="Remove format"
                          >
                            <XMarkIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={onAddVideoFormat}
                        className="w-full flex items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add Download Format
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateVideoUrls(editingDownloadUrls.filter(f => f.url.trim() !== ''))}
                        disabled={savingUrls}
                        className="w-full flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {savingUrls ? 'Saving...' : 'Save URLs'}
                      </button>
                    </div>
                  ) : (
                    <>
                      {validFormats.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {validFormats.map((format, index) => {
                            const formatKey = `video-${asset.id}-${format.resolution}`;
                            const isDownloading = downloadingFormats.has(formatKey);
                            return (
                              <button
                                key={index}
                                type="button"
                                disabled={isDownloading}
                                onClick={() => onDownload && onDownload(asset, format.resolution)}
                                className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-wait"
                              >
                                {isDownloading ? (
                                  <>
                                    <svg className="animate-spin h-4 w-4 text-gray-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Preparing...
                                  </>
                                ) : (
                                  <>
                                    <ArrowDownTrayIcon className="h-4 w-4" />
                                    Download {format.resolution}
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">
                          {isAdmin ? 'No download URLs configured. Click "Edit Download URLs" above to add download links.' : 'No download URLs available for this video.'}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : null}

              {/* Preview button for non-video assets */}
              {asset.asset_type !== 'video' && asset.current_version?.id && accessToken ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Use preview API route with original rendition (not thumbnail) for high-res preview
                    const previewUrl = `/api/assets/${asset.id}/preview?version=${asset.current_version!.id}&rendition=original&token=${encodeURIComponent(accessToken)}`;
                    window.open(previewUrl, '_blank');
                  }}
                  className="inline-flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition shadow-sm mb-3"
                >
                  <EyeIcon className="h-4 w-4" />
                  Preview
                </button>
              ) : null}
            </div>

            {/* Metadata Section */}
            <div className="space-y-4">
              <div className="pb-4 border-b border-gray-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Details</h3>
                <dl className="space-y-2 text-sm">
                  {asset.sku && (
                    <div>
                      <dt className="font-medium text-gray-700 mb-1">SKU</dt>
                      <dd className="text-gray-600">{asset.sku}</dd>
                    </div>
                  )}
                  {asset.product_line && (
                    <div>
                      <dt className="font-medium text-gray-700 mb-1">Product Line</dt>
                      <dd className="text-gray-600">{asset.product_line}</dd>
                    </div>
                  )}
                  {asset.product_name && (
                    <div>
                      <dt className="font-medium text-gray-700 mb-1">Product</dt>
                      <dd className="text-gray-600">{asset.product_name}</dd>
                    </div>
                  )}
                  {asset.campaign && (
                    <div>
                      <dt className="font-medium text-gray-700 mb-1">Campaign</dt>
                      <dd className="text-gray-600">
                        <a
                          href={`/admin/dam/campaigns/${asset.campaign.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            window.location.href = `/admin/dam/campaigns/${asset.campaign!.id}`;
                          }}
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          {asset.campaign.name}
                        </a>
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="font-medium text-gray-700 mb-1">Created</dt>
                    <dd className="text-gray-600">{new Date(asset.created_at).toLocaleDateString()}</dd>
                  </div>
                  {asset.current_version && (
                    <>
                      <div>
                        <dt className="font-medium text-gray-700 mb-1">Size</dt>
                        <dd className="text-gray-600">{formatBytes(asset.current_version.file_size) || '—'}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700 mb-1">File Type</dt>
                        <dd className="text-gray-600">{getFriendlyFileType(asset.current_version.mime_type)}</dd>
                      </div>
                      {asset.current_version.width && asset.current_version.height && (
                        <div>
                          <dt className="font-medium text-gray-700 mb-1">Dimensions</dt>
                          <dd className="text-gray-600">{asset.current_version.width} × {asset.current_version.height} px</dd>
                        </div>
                      )}
                    </>
                  )}
                </dl>
              </div>

              {asset.tags.length > 0 && (
                <div className="pb-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Tags</h3>
                  <div className="flex flex-wrap gap-2">
                    {asset.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {asset.locales.length > 0 && (
                <div className="pb-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Locales</h3>
                  <div className="flex flex-wrap gap-2">
                    {asset.locales.map((locale) => (
                      <span key={locale.code} className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                        {locale.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {asset.regions.length > 0 && (
                <div className="pb-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900 mb-2.5 uppercase tracking-wide">Regions</h3>
                  <div className="flex flex-wrap gap-2">
                    {asset.regions.map((region) => (
                      <span key={region.code} className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                        {region.label}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-gray-100 flex flex-col gap-2">
              {asset.current_version?.downloadPath && onDownload && (
                <button
                  type="button"
                  disabled={isDownloadingAsset}
                  onClick={() => onDownload(asset)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-black px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition shadow-sm disabled:opacity-50 disabled:cursor-wait"
                >
                  {isDownloadingAsset ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Preparing...
                    </>
                  ) : (
                    <>
                      <ArrowDownTrayIcon className="h-4 w-4" />
                      Download Asset
                    </>
                  )}
                </button>
              )}
              {isAdmin && onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(asset)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                >
                  <PencilIcon className="h-4 w-4" />
                  Edit Asset
                </button>
              )}
              {isAdmin && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(asset.id)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
                >
                  <TrashIcon className="h-4 w-4" />
                  Delete Asset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

